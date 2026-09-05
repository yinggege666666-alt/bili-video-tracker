"""B站网页接口抓取（仅依赖 Python 标准库）。"""

import gzip
import hashlib
import http.cookiejar
import json
import re
import time
import urllib.request
from urllib.parse import urlencode, urlparse

API_URL = "https://api.bilibili.com/x/web-interface/view"
VIEW_DETAIL_API_URL = "https://api.bilibili.com/x/web-interface/view/detail"
WBI_VIEW_DETAIL_API_URL = "https://api.bilibili.com/x/web-interface/wbi/view/detail"
NAV_URL = "https://api.bilibili.com/x/web-interface/nav"
PAGE_URL = "https://www.bilibili.com/video/{bvid}"
WBI_MIXIN_KEY_ORDER = (
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
)
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.bilibili.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "gzip",
}

_WBI_MIXIN_KEY = None
_BILI_COOKIE = None


class BiliFetchError(Exception):
    """抓取 B 站数据失败。"""


def _read_response(response) -> bytes:
    raw = response.read()
    if raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    return raw


def _video_dict(bvid: str, data: dict) -> dict:
    stat = data.get("stat") or {}
    return {
        "bvid": bvid,
        "title": data.get("title") or "",
        "owner": (data.get("owner") or {}).get("name") or "",
        "pubdate": int(data.get("pubdate") or 0),
        "view": int(stat.get("view") or 0),
        "reply": int(stat.get("reply") or 0),
        "like": int(stat.get("like") or 0),
        "coin": int(stat.get("coin") or 0),
        "favorite": int(stat.get("favorite") or 0),
        "share": int(stat.get("share") or 0),
    }


def _get_wbi_mixin_key(timeout: int) -> str:
    global _WBI_MIXIN_KEY
    if _WBI_MIXIN_KEY:
        return _WBI_MIXIN_KEY

    request = urllib.request.Request(NAV_URL, headers=REQUEST_HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(_read_response(response).decode("utf-8", "ignore"))
    wbi_img = (payload.get("data") or {}).get("wbi_img") or {}
    keys = []
    for field in ("img_url", "sub_url"):
        value = wbi_img.get(field)
        if not isinstance(value, str):
            raise BiliFetchError("无法取得 WBI 签名信息")
        filename = urlparse(value).path.rsplit("/", 1)[-1]
        keys.append(filename.split(".", 1)[0])
    source = "".join(keys)
    _WBI_MIXIN_KEY = "".join(
        source[index] for index in WBI_MIXIN_KEY_ORDER if index < len(source)
    )[:32]
    return _WBI_MIXIN_KEY


def _get_bili_cookie(timeout: int) -> str:
    global _BILI_COOKIE
    if _BILI_COOKIE is not None:
        return _BILI_COOKIE

    cookie = ""
    try:
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar)
        )
        request = urllib.request.Request("https://www.bilibili.com/", headers=REQUEST_HEADERS)
        opener.open(request, timeout=timeout).read()
        cookie = "; ".join(
            f"{item.name}={item.value}"
            for item in jar
            if item.name in {"buvid3", "buvid4", "b_nut"}
        )
    except Exception:
        cookie = ""
    _BILI_COOKIE = cookie
    return cookie


def _sign_wbi(params: dict, timeout: int) -> dict:
    mixin_key = _get_wbi_mixin_key(timeout)
    signed = {
        key: str(value).translate(str.maketrans("", "", "!'()*"))
        for key, value in params.items()
    }
    signed["wts"] = str(int(time.time()))
    query = urlencode(sorted(signed.items()))
    signed["w_rid"] = hashlib.md5(f"{query}{mixin_key}".encode()).hexdigest()
    return signed


def _fetch_api(bvid: str, timeout: int) -> dict:
    params = _sign_wbi({"bvid": bvid}, timeout)
    url = f"{WBI_VIEW_DETAIL_API_URL}?{urlencode(params)}"
    headers = dict(REQUEST_HEADERS)
    cookie = _get_bili_cookie(timeout)
    if cookie:
        headers["Cookie"] = cookie
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(_read_response(response).decode("utf-8", "ignore"))
    if payload.get("code") != 0:
        message = payload.get("message") or f"接口返回 code={payload.get('code')}"
        raise BiliFetchError(message)
    data = payload.get("data") or {}
    video = data.get("View") or data
    if not video or not video.get("stat"):
        raise BiliFetchError("接口未返回统计数据")
    return _video_dict(bvid, video)


def _fetch_page(bvid: str, timeout: int) -> dict:
    url = PAGE_URL.format(bvid=bvid)
    headers = dict(REQUEST_HEADERS)
    headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = _read_response(response)
    html = raw.decode("utf-8", "ignore")
    match = re.search(
        r"<script>window\.__INITIAL_STATE__=(.*?)</script>", html, re.S
    )
    if not match:
        raise BiliFetchError("视频页面中未找到数据")
    text = match.group(1)
    script_index = text.find(";(function(){")
    if script_index > 0:
        text = text[:script_index]
    try:
        state = json.loads(text)
    except json.JSONDecodeError as exc:
        raise BiliFetchError(f"视频页面数据解析失败：{exc}") from exc
    video = state.get("videoData") or {}
    if not video or not video.get("stat"):
        raise BiliFetchError("视频不存在或无法访问")
    return _video_dict(bvid, video)


def _fetch_jina_api(bvid: str, timeout: int) -> dict:
    api_url = f"{VIEW_DETAIL_API_URL}?bvid={bvid}"
    proxy_url = "https://r.jina.ai/http://" + api_url.replace("https://", "")
    request = urllib.request.Request(
        proxy_url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/plain, application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = _read_response(response).decode("utf-8", "ignore")
    start = text.find("{")
    if start < 0:
        raise BiliFetchError("代理响应中没有 JSON")
    try:
        payload, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError as exc:
        raise BiliFetchError(f"代理响应解析失败：{exc}") from exc
    if payload.get("code") != 0:
        message = payload.get("message") or f"接口返回 code={payload.get('code')}"
        raise BiliFetchError(message)
    data = payload.get("data") or {}
    video = data.get("View") or data
    if not video or not video.get("stat"):
        raise BiliFetchError("代理未返回统计数据")
    return _video_dict(bvid, video)


def fetch_video(bvid: str, max_retries: int = 1, timeout: int = 30) -> dict:
    """抓取单个视频：接口、视频页面、公开代理依次尝试。"""
    last_error: Exception | None = None
    for attempt in range(max_retries):
        try:
            return _fetch_api(bvid, timeout)
        except Exception as exc:
            last_error = exc
            time.sleep(0.8)
        try:
            return _fetch_page(bvid, timeout)
        except Exception as exc:
            last_error = exc
            time.sleep(0.8)
        try:
            return _fetch_jina_api(bvid, timeout)
        except Exception as exc:
            last_error = exc
    raise BiliFetchError(f"获取 {bvid} 失败：{last_error}")
