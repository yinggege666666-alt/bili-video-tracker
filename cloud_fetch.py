"""云端定时抓取：读取配置，抓取 B 站数据，写入 public/data.json。"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from bilibili import BiliFetchError, fetch_video

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "docs"
CONFIG_PATH = ROOT / "config.json"
DATA_PATH = PUBLIC_DIR / "data.json"

CN_TZ = ZoneInfo("Asia/Shanghai")
BV_PATTERN = re.compile(r"BV[0-9A-Za-z]{10}")
ADD_PATTERN = re.compile(r"添加.*?(BV[0-9A-Za-z]{10})", re.I)
DELETE_PATTERN = re.compile(r"删除.*?(BV[0-9A-Za-z]{10})", re.I)
MAX_HISTORY_PER_VIDEO = 8760


def now_cn() -> datetime:
    return datetime.now(CN_TZ)


def hour_key_cn(dt: datetime | None = None) -> str:
    return (dt or now_cn()).strftime("%Y-%m-%d %H:00")


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def gh_api(method: str, path: str, payload=None) -> dict | None:
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not token or not repo:
        return None
    url = f"https://api.github.com{path}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/vnd.github+json")
    request.add_header("User-Agent", "bili-cloud-tracker")
    request.add_header("X-GitHub-Api-Version", "2022-11-28")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        print(f"GitHub API {method} {path} 失败：HTTP {exc.code}")
        return None
    except Exception as exc:
        print(f"GitHub API {method} {path} 失败：{exc}")
        return None


def process_issues(config: dict) -> bool:
    """处理网页提交的“添加/删除 BV”GitHub Issue，返回配置是否变化。"""
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        return False
    issues = gh_api("GET", f"/repos/{repo}/issues?state=open&per_page=100") or []
    changed = False
    videos = list(config.get("videos", []))

    for issue in issues:
        if issue.get("pull_request"):
            continue
        number = issue.get("number")
        text = f"{issue.get('title') or ''} {issue.get('body') or ''}"
        added = ADD_PATTERN.search(text)
        removed = DELETE_PATTERN.search(text)
        reply = ""
        if added and not removed:
            bvid = added.group(1)
            if bvid not in videos:
                videos.append(bvid)
                changed = True
                reply = f"已添加 {bvid}，下一小时自动抓取数据。"
            else:
                reply = f"{bvid} 已在列表中。"
        elif removed:
            bvid = removed.group(1)
            if bvid in videos:
                videos.remove(bvid)
                changed = True
                reply = f"已删除 {bvid}。"
            else:
                reply = f"{bvid} 不在列表中。"
        if reply:
            gh_api("POST", f"/repos/{repo}/issues/{number}/comments", {"body": reply})
            gh_api("PATCH", f"/repos/{repo}/issues/{number}", {"state": "closed"})

    if changed:
        config["videos"] = videos
        save_json(CONFIG_PATH, config)
    return changed


def upsert_snapshot(history: list[dict], hour: str, info: dict) -> None:
    snapshot = {
        "time": hour,
        "view": info["view"],
        "reply": info["reply"],
        "like": info["like"],
        "coin": info["coin"],
        "favorite": info["favorite"],
        "share": info["share"],
    }
    for index, item in enumerate(history):
        if item["time"] == hour:
            history[index] = snapshot
            return
    history.append(snapshot)
    history.sort(key=lambda item: item["time"])
    if len(history) > MAX_HISTORY_PER_VIDEO:
        del history[: len(history) - MAX_HISTORY_PER_VIDEO]


def run_update(config: dict) -> None:
    data = load_json(DATA_PATH, {"videos": [], "last_update": "", "last_error": ""})
    existing = {video["bvid"]: video for video in data.get("videos", [])}
    videos: list[dict] = []
    errors: list[str] = []
    hour = hour_key_cn()

    for sort_order, bvid in enumerate(config.get("videos", []), start=1):
        try:
            info = fetch_video(bvid)
            video = existing.get(bvid, {})
            video.update(
                {
                    "bvid": bvid,
                    "sort_order": sort_order,
                    "title": info["title"],
                    "owner": info["owner"],
                    "pubdate": info["pubdate"],
                }
            )
            video.setdefault("history", [])
            upsert_snapshot(video["history"], hour, info)
            videos.append(video)
            print(f"OK {bvid} 播放 {info['view']}")
        except BiliFetchError as exc:
            errors.append(str(exc))
            print(f"FAIL {bvid} {exc}", file=sys.stderr)
            video = existing.get(bvid)
            if video is None:
                video = {
                    "bvid": bvid,
                    "sort_order": sort_order,
                    "title": "等待首次抓取",
                    "owner": "",
                    "pubdate": 0,
                    "history": [],
                }
            video["sort_order"] = sort_order
            videos.append(video)
        time.sleep(0.4)

    videos.sort(key=lambda item: item.get("sort_order", 9999))
    data["videos"] = videos
    data["last_update"] = now_cn().strftime("%Y-%m-%d %H:%M:%S")
    data["last_error"] = "；".join(errors[:3])
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    data["repo_url"] = f"https://github.com/{repo}" if repo else ""
    save_json(DATA_PATH, data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--process-issues", action="store_true", help="处理添加/删除视频的 Issue")
    args = parser.parse_args()

    config = load_json(CONFIG_PATH, {"videos": []})
    if args.process_issues:
        process_issues(config)

    run_update(config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
