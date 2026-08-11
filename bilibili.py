"""B站网页接口抓取（仅依赖 Python 标准库）。"""

import gzip
import json
import re
import time
import urllib.request

API_URL = "https://api.bilibili.com/x/web-interface/view"
PAGE_URL = "https://www.bilibili.com/video/{bvid}"
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


def _fetch_api(bvid: str, timeout: int) -> dict:
    url = f"{API_URL}?bvid={bvid}"
    request = urllib.request.Request(url, headers=REQUEST_HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(_read_response(response).decode("utf-8", "ignore"))
    if payload.get("code") != 0:
        message = payload.get("message") or f"接口返回 code={payload.get('code')}"
        raise BiliFetchError(message)
    data = payload.get("data") or {}
    if not data or not data.get("stat"):
        raise BiliFetchError("接口未返回统计数据")
    return _video_dict(bvid, data)


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


def fetch_video(bvid: str, max_retries: int = 2, timeout: int = 20) -> dict:
    """抓取单个视频的信息与统计：先走接口，失败后解析视频页面。"""
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
            if attempt < max_retries - 1:
                time.sleep(0.8)
    raise BiliFetchError(f"获取 {bvid} 失败：{last_error}")
