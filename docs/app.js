(function () {
  "use strict";

  const ALL_VIDEOS_KEY = "__all__";

  const state = {
    data: null,
    dashboard: null,
    rows: [],
    ownerColors: new Map(),
    search: "",
    days: 30,
    selectedBvid: ALL_VIDEOS_KEY,
    sort: { key: "sort_order", dir: 1 },
    videoTrends: { hourly: [], daily: [] },
    loading: false,
  };

  const AGGREGATE_CARD_DEFS = [
    { key: "video_count", label: "视频数", color: "#0f766e", suffix: "个", field: "videos" },
    { key: "total_plays", label: "总播放", color: "#2563eb", suffix: "", field: "plays" },
    { key: "total_comments", label: "总评论", color: "#7c3aed", suffix: "", field: "comments" },
    { key: "hour_plays", label: "本小时新增播放", color: "#0ea5e9", suffix: "", field: "play_delta" },
    { key: "hour_comments", label: "本小时新增评论", color: "#db2777", suffix: "", field: "comment_delta" },
    { key: "today_comments", label: "今日评论", color: "#c2410c", suffix: "", series: "daily", field: "comment_delta" },
    { key: "comment_rate", label: "平均评论率", color: "#0891b2", suffix: "%" },
    { key: "like_rate", label: "平均点赞率", color: "#d97706", suffix: "%" },
    { key: "coin_rate", label: "平均投币率", color: "#059669", suffix: "%" },
    { key: "favorite_rate", label: "平均收藏率", color: "#db2777", suffix: "%" },
    { key: "share_rate", label: "平均分享率", color: "#4f46e5", suffix: "%" },
  ];

  const VIDEO_CARD_DEFS = [
    { key: "hour_comment", label: "每小时新增评论", color: "#0891b2", suffix: "", series: "hourly", field: "comment_delta", format: "int", note: "最近一小时" },
    { key: "hour_like", label: "每小时新增点赞", color: "#d97706", suffix: "", series: "hourly", field: "like_delta", format: "int", note: "最近一小时" },
    { key: "hour_coin", label: "每小时新增投币", color: "#059669", suffix: "", series: "hourly", field: "coin_delta", format: "int", note: "最近一小时" },
    { key: "hour_favorite", label: "每小时新增收藏", color: "#db2777", suffix: "", series: "hourly", field: "favorite_delta", format: "int", note: "最近一小时" },
    { key: "hour_share", label: "每小时新增分享", color: "#4f46e5", suffix: "", series: "hourly", field: "share_delta", format: "int", note: "最近一小时" },
    { key: "hour_play", label: "每小时新增播放", color: "#2563eb", suffix: "", series: "hourly", field: "play_delta", format: "int", note: "最近一小时" },
    { key: "day_play", label: "每日新增播放", color: "#0ea5e9", suffix: "", series: "daily", field: "play_delta", format: "int", note: "最新一天" },
    { key: "day_comment", label: "今日评论", color: "#c2410c", suffix: "", series: "daily", field: "comment_delta", format: "int", note: "最新一天" },
    { key: "avg_daily_plays", label: "日均播放", color: "#0f766e", suffix: "", series: "hourly", field: "avg_daily_plays", format: "int", note: "最近快照" },
    { key: "comment_rate", label: "评论率", color: "#0891b2", suffix: "%", series: "hourly", field: "comment_rate", format: "rate", note: "最近快照" },
    { key: "like_rate", label: "点赞率", color: "#d97706", suffix: "%", series: "hourly", field: "like_rate", format: "rate", note: "最近快照" },
    { key: "coin_rate", label: "投币率", color: "#059669", suffix: "%", series: "hourly", field: "coin_rate", format: "rate", note: "最近快照" },
    { key: "favorite_rate", label: "收藏率", color: "#db2777", suffix: "%", series: "hourly", field: "favorite_rate", format: "rate", note: "最近快照" },
    { key: "share_rate", label: "分享率", color: "#4f46e5", suffix: "%", series: "hourly", field: "share_rate", format: "rate", note: "最近快照" },
  ];

  const SORT_COLUMNS = [
    { key: "sort_order", label: "默认排序" },
    { key: "owner", label: "账号" },
    { key: "bvid", label: "BV号" },
    { key: "title", label: "标题" },
    { key: "view", label: "播放" },
    { key: "reply", label: "评论" },
    { key: "like", label: "点赞" },
    { key: "coin", label: "投币" },
    { key: "favorite", label: "收藏" },
    { key: "share", label: "分享" },
    { key: "hour_plays", label: "本小时播放" },
    { key: "hour_comments", label: "本小时评论" },
    { key: "yesterday_plays", label: "昨日播放" },
    { key: "today_plays", label: "今日播放" },
    { key: "today_comments", label: "今日评论" },
    { key: "yesterday_comments", label: "昨日评论" },
    { key: "published_days", label: "已发布天数" },
    { key: "avg_daily_plays", label: "日均播放" },
    { key: "comment_rate", label: "评论率" },
    { key: "like_rate", label: "点赞率" },
    { key: "coin_rate", label: "投币率" },
    { key: "favorite_rate", label: "收藏率" },
    { key: "share_rate", label: "分享率" },
  ];

  function ownerColorFor(index) {
    const hue = Math.round((index * 137.508) % 360);
    return "hsl(" + hue + ", 65%, 92%)";
  }

  function buildOwnerColors(rows) {
    const colors = new Map();
    const owners = Array.from(
      new Set(
        rows
          .map((row) => String(row.owner || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" }));
    owners.forEach((owner, index) => {
      colors.set(owner, ownerColorFor(index));
    });
    return colors;
  }

  const cardsEl = document.getElementById("cards");
  const videoSelect = document.getElementById("videoSelect");
  const sortSelect = document.getElementById("sortSelect");
  const sortDirBtn = document.getElementById("sortDirBtn");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const addForm = document.getElementById("addForm");
  const bvInput = document.getElementById("bvInput");
  const messageEl = document.getElementById("message");
  const statusLine = document.getElementById("statusLine");
  const tableBody = document.getElementById("videoTableBody");
  const tableCount = document.getElementById("tableCount");
  const emptyState = document.getElementById("emptyState");
  const tableHead = document.querySelector("#videoTable thead");
  const periodButtons = document.querySelectorAll("#periodButtons button");

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInt(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function formatRate(value) {
    return BiliCharts.formatPercent(value);
  }

  function pct(value, total) {
    return total ? Number(((value / total) * 100).toFixed(2)) : 0;
  }

  function cnDatePrefix(offsetDays = 0) {
    const date = new Date(Date.now() + (offsetDays || 0) * 86400000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    return parts;
  }

  function hourToTs(hour) {
    const parts = String(hour || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):00$/);
    if (!parts) return 0;
    return Date.UTC(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
      Number(parts[4]) - 8
    );
  }

  function tsToHourCN(ts) {
    return (
      new Date(ts + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + ":00"
    );
  }

  function defaultDirFor(key) {
    return key === "sort_order" || key === "title" || key === "bvid" || key === "owner"
      ? 1
      : -1;
  }

  function formatCardValue(def, value) {
    if (def.format === "rate" || def.key.endsWith("_rate")) {
      return value.toFixed(2);
    }
    return BiliCharts.formatCompact(value);
  }

  function chartFormat(def) {
    return def.format === "rate" || def.key.endsWith("_rate")
      ? formatRate
      : formatInt;
  }

  function delta(previous, current, key) {
    if (!previous) return 0;
    return Math.max(0, Number(current[key] || 0) - Number(previous[key] || 0));
  }

  function buildVideoRows(videos) {
    const todayPrefix = cnDatePrefix();
    const yesterdayPrefix = cnDatePrefix(-1);
    const nowSec = Math.floor(Date.now() / 1000);
    return videos.map((video) => {
      const history = (video.history || [])
        .slice()
        .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1));
      const latest = history[history.length - 1] || {};
      const previous = history[history.length - 2];
      const view = Number(latest.view || 0);
      const hourPlays = previous
        ? Math.max(0, view - Number(previous.view || 0))
        : 0;
      const hourComments = previous
        ? Math.max(0, Number(latest.reply || 0) - Number(previous.reply || 0))
        : 0;

      const earliestTodayIndex = history.findIndex((item) =>
        String(item.time || "").startsWith(todayPrefix)
      );
      let todayPlays = 0;
      if (earliestTodayIndex >= 0) {
        const base =
          earliestTodayIndex > 0
            ? Number(history[earliestTodayIndex - 1].view || 0)
            : Number(history[earliestTodayIndex].view || 0);
        todayPlays = Math.max(0, view - base);
      }

      const pubdate = Number(video.pubdate || 0);
      const publishedDays = pubdate
        ? Math.max(1, Math.floor((nowSec - pubdate) / 86400))
        : 0;
      const reply = Number(latest.reply || 0);
      const like = Number(latest.like || 0);
      const coin = Number(latest.coin || 0);
      const favorite = Number(latest.favorite || 0);
      const share = Number(latest.share || 0);
      let todayComments = 0;
      if (earliestTodayIndex >= 0) {
        const base =
          earliestTodayIndex > 0
            ? Number(history[earliestTodayIndex - 1].reply || 0)
            : Number(history[earliestTodayIndex].reply || 0);
        todayComments = Math.max(0, reply - base);
      }

      const firstYesterdayIndex = history.findIndex((item) =>
        String(item.time || "").startsWith(yesterdayPrefix)
      );
      let yesterdayPlays = 0;
      let yesterdayComments = 0;
      if (firstYesterdayIndex >= 0) {
        let lastYesterdayIndex = firstYesterdayIndex;
        while (
          lastYesterdayIndex + 1 < history.length &&
          String(history[lastYesterdayIndex + 1].time || "").startsWith(
            yesterdayPrefix
          )
        ) {
          lastYesterdayIndex += 1;
        }
        const base =
          firstYesterdayIndex > 0
            ? history[firstYesterdayIndex - 1]
            : history[firstYesterdayIndex];
        const end = history[lastYesterdayIndex];
        yesterdayPlays = Math.max(
          0,
          Number(end.view || 0) - Number(base.view || 0)
        );
        yesterdayComments = Math.max(
          0,
          Number(end.reply || 0) - Number(base.reply || 0)
        );
      }

      return {
        bvid: video.bvid,
        title: video.title || "等待首次抓取",
        owner: video.owner || "",
        pubdate: pubdate,
        sort_order: Number(video.sort_order || 0),
        history: history,
        view: view,
        reply: reply,
        like: like,
        coin: coin,
        favorite: favorite,
        share: share,
        hour_plays: hourPlays,
        hour_comments: hourComments,
        today_plays: todayPlays,
        today_comments: todayComments,
        yesterday_plays: yesterdayPlays,
        yesterday_comments: yesterdayComments,
        published_days: publishedDays,
        avg_daily_plays: publishedDays ? Math.round(view / publishedDays) : 0,
        comment_rate: pct(reply, view),
        like_rate: pct(like, view),
        coin_rate: pct(coin, view),
        favorite_rate: pct(favorite, view),
        share_rate: pct(share, view),
        last_update: latest.time || "",
      };
    });
  }

  function buildCards(rows) {
    const totalPlays = rows.reduce((sum, row) => sum + row.view, 0);
    const totalComments = rows.reduce((sum, row) => sum + row.reply, 0);
    const totalLikes = rows.reduce((sum, row) => sum + row.like, 0);
    const totalCoins = rows.reduce((sum, row) => sum + row.coin, 0);
    const totalFavorites = rows.reduce((sum, row) => sum + row.favorite, 0);
    const totalShares = rows.reduce((sum, row) => sum + row.share, 0);
    const hourPlays = rows.reduce((sum, row) => sum + row.hour_plays, 0);
    const hourComments = rows.reduce((sum, row) => sum + row.hour_comments, 0);
    const todayComments = rows.reduce((sum, row) => sum + row.today_comments, 0);
    return {
      video_count: rows.length,
      total_plays: totalPlays,
      total_comments: totalComments,
      hour_plays: hourPlays,
      hour_comments: hourComments,
      today_comments: todayComments,
      comment_rate: pct(totalComments, totalPlays),
      like_rate: pct(totalLikes, totalPlays),
      coin_rate: pct(totalCoins, totalPlays),
      favorite_rate: pct(totalFavorites, totalPlays),
      share_rate: pct(totalShares, totalPlays),
    };
  }

  function buildChartHistory(videos, days) {
    const hourSet = new Set();
    videos.forEach((video) => {
      (video.history || []).forEach((item) => hourSet.add(item.time));
    });
    let hours = Array.from(hourSet).sort();
    if (days > 0 && hours.length) {
      const lastTs = hourToTs(hours[hours.length - 1]);
      const cutoffHour = tsToHourCN(lastTs - days * 86400000);
      hours = hours.filter((hour) => hour >= cutoffHour);
    }

    const pointers = videos.map((video) => ({
      history: (video.history || [])
        .slice()
        .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1)),
      index: -1,
      previous: null,
      current: null,
    }));

    return hours.map((hour) => {
      const included = [];
      let playDelta = 0;
      let commentDelta = 0;
      pointers.forEach((pointer) => {
        while (
          pointer.index + 1 < pointer.history.length &&
          pointer.history[pointer.index + 1].time <= hour
        ) {
          pointer.index += 1;
        }
        pointer.current =
          pointer.index >= 0 ? pointer.history[pointer.index] : null;
        if (pointer.current) {
          included.push(pointer.current);
          if (pointer.previous) {
            playDelta += Math.max(
              0,
              Number(pointer.current.view || 0) - Number(pointer.previous.view || 0)
            );
            commentDelta += Math.max(
              0,
              Number(pointer.current.reply || 0) - Number(pointer.previous.reply || 0)
            );
          }
        }
        pointer.previous = pointer.current;
      });
      const plays = included.reduce((sum, item) => sum + Number(item.view || 0), 0);
      const comments = included.reduce((sum, item) => sum + Number(item.reply || 0), 0);
      const likes = included.reduce((sum, item) => sum + Number(item.like || 0), 0);
      const coins = included.reduce((sum, item) => sum + Number(item.coin || 0), 0);
      const favorites = included.reduce((sum, item) => sum + Number(item.favorite || 0), 0);
      const shares = included.reduce((sum, item) => sum + Number(item.share || 0), 0);
      return {
        time: hour,
        videos: included.length,
        plays: plays,
        comments: comments,
        play_delta: playDelta,
        comment_delta: commentDelta,
        likes: likes,
        coins: coins,
        favorites: favorites,
        shares: shares,
        comment_rate: pct(comments, plays),
        like_rate: pct(likes, plays),
        coin_rate: pct(coins, plays),
        favorite_rate: pct(favorites, plays),
        share_rate: pct(shares, plays),
      };
    });
  }

  function buildVideoHourly(video, days) {
    let history = (video.history || [])
      .slice()
      .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1));
    if (days > 0 && history.length) {
      const lastTs = hourToTs(history[history.length - 1].time);
      const cutoffHour = tsToHourCN(lastTs - days * 86400000);
      history = history.filter((item) => String(item.time || "") >= cutoffHour);
    }
    const pubdate = Number(video.pubdate || 0);
    return history.map((item, index) => {
      const previous = history[index - 1];
      const view = Number(item.view || 0);
      const snapshotSec =
        hourToTs(item.time) / 1000 || Math.floor(Date.now() / 1000);
      const publishedDays = pubdate
        ? Math.max(1, Math.floor((snapshotSec - pubdate) / 86400))
        : 0;
      return {
        time: item.time,
        comment_delta: delta(previous, item, "reply"),
        like_delta: delta(previous, item, "like"),
        coin_delta: delta(previous, item, "coin"),
        favorite_delta: delta(previous, item, "favorite"),
        share_delta: delta(previous, item, "share"),
        play_delta: delta(previous, item, "view"),
        avg_daily_plays: publishedDays ? Math.round(view / publishedDays) : 0,
        comment_rate: pct(Number(item.reply || 0), view),
        like_rate: pct(Number(item.like || 0), view),
        coin_rate: pct(Number(item.coin || 0), view),
        favorite_rate: pct(Number(item.favorite || 0), view),
        share_rate: pct(Number(item.share || 0), view),
      };
    });
  }

  function buildDailyPlays(video, days) {
    const history = (video.history || [])
      .slice()
      .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1));
    if (!history.length) return [];

    const byDay = new Map();
    history.forEach((item) => {
      const day = String(item.time || "").slice(0, 10);
      if (!day) return;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    });

    const lastTs = hourToTs(history[history.length - 1].time);
    const cutoffDay =
      days > 0 ? tsToHourCN(lastTs - days * 86400000).slice(0, 10) : "";
    const dayKeys = Array.from(byDay.keys()).sort();
    const points = [];
    let previousEnd = null;

    dayKeys.forEach((day) => {
      const entries = byDay
        .get(day)
        .slice()
        .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1));
      const end = entries[entries.length - 1];
      const start = entries[0];
      const base = previousEnd
        ? Number(previousEnd.view || 0)
        : Number(start.view || 0);
      if (!cutoffDay || day >= cutoffDay) {
        points.push({
          time: day,
          play_delta: Math.max(0, Number(end.view || 0) - base),
          comment_delta: Math.max(
            0,
            Number(end.reply || 0) -
              (previousEnd
                ? Number(previousEnd.reply || 0)
                : Number(start.reply || 0))
          ),
        });
      }
      previousEnd = end;
    });

    return points;
  }

  function buildDailyHistory(videos, days) {
    const byDay = new Map();

    videos.forEach((video) => {
      const history = (video.history || [])
        .slice()
        .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1));
      if (!history.length) return;

      const byVideoDay = new Map();
      history.forEach((item) => {
        const day = String(item.time || "").slice(0, 10);
        if (!day) return;
        if (!byVideoDay.has(day)) byVideoDay.set(day, []);
        byVideoDay.get(day).push(item);
      });

      const lastTs = hourToTs(history[history.length - 1].time);
      const cutoffDay =
        days > 0 ? tsToHourCN(lastTs - days * 86400000).slice(0, 10) : "";
      const dayKeys = Array.from(byVideoDay.keys()).sort();
      let previousEnd = null;

      dayKeys.forEach((day) => {
        const entries = byVideoDay
          .get(day)
          .slice()
          .sort((a, b) => (String(a.time) < String(b.time) ? -1 : 1));
        const end = entries[entries.length - 1];
        const start = entries[0];
        const baseView = previousEnd
          ? Number(previousEnd.view || 0)
          : Number(start.view || 0);
        const baseReply = previousEnd
          ? Number(previousEnd.reply || 0)
          : Number(start.reply || 0);
        if (!cutoffDay || day >= cutoffDay) {
          const point = byDay.get(day) || {
            time: day,
            play_delta: 0,
            comment_delta: 0,
          };
          point.play_delta += Math.max(
            0,
            Number(end.view || 0) - baseView
          );
          point.comment_delta += Math.max(
            0,
            Number(end.reply || 0) - baseReply
          );
          byDay.set(day, point);
        }
        previousEnd = end;
      });
    });

    return Array.from(byDay.values()).sort((a, b) =>
      String(a.time) < String(b.time) ? -1 : 1
    );
  }

  function buildVideoTrends(video, days) {
    return {
      hourly: buildVideoHourly(video, days),
      daily: buildDailyPlays(video, days),
    };
  }

  function populateVideoSelect(rows) {
    const previous = state.selectedBvid;
    videoSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = ALL_VIDEOS_KEY;
    allOption.textContent = "全部视频（总览）";
    videoSelect.appendChild(allOption);

    rows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.bvid;
      option.textContent = (row.title || row.bvid) + " · " + row.bvid;
      videoSelect.appendChild(option);
    });

    if (rows.some((row) => row.bvid === previous)) {
      state.selectedBvid = previous;
    } else if (rows.length) {
      state.selectedBvid = rows[0].bvid;
    } else {
      state.selectedBvid = ALL_VIDEOS_KEY;
    }
    videoSelect.value = state.selectedBvid;
  }

  function populateSortSelect() {
    sortSelect.innerHTML = "";
    SORT_COLUMNS.forEach((column) => {
      const option = document.createElement("option");
      option.value = column.key;
      option.textContent = column.label;
      sortSelect.appendChild(option);
    });
    updateSortControl();
  }

  function updateSortControl() {
    sortSelect.value = state.sort.key;
    sortDirBtn.textContent = state.sort.dir === 1 ? "升序 ↑" : "降序 ↓";
    document.querySelectorAll("th[data-sort]").forEach((th) => {
      const active = th.dataset.sort === state.sort.key;
      th.classList.toggle("sorted", active);
      th.setAttribute("data-arrow", active ? (state.sort.dir === 1 ? "↑" : "↓") : "");
      th.setAttribute(
        "aria-sort",
        active ? (state.sort.dir === 1 ? "ascending" : "descending") : "none"
      );
    });
  }

  function setMessage(text, type) {
    messageEl.textContent = text || "";
    messageEl.className = "message" + (type ? " " + type : "");
    if (text) {
      setTimeout(() => {
        if (messageEl.textContent === text) {
          messageEl.textContent = "";
          messageEl.className = "message";
        }
      }, 8000);
    }
  }

  function updateVideoTrends() {
    const selected = state.rows.find((row) => row.bvid === state.selectedBvid);
    state.videoTrends = selected
      ? buildVideoTrends(selected, state.days)
      : { hourly: [], daily: [] };
  }

  function renderCards() {
    const selected = state.rows.find((row) => row.bvid === state.selectedBvid);
    const isSingle = Boolean(selected);
    const defs = isSingle ? VIDEO_CARD_DEFS : AGGREGATE_CARD_DEFS;
    BiliCharts.clearCharts();
    cardsEl.innerHTML = "";

    defs.forEach((def) => {
      const card = document.createElement("article");
      card.className = "metric-card";
      const points = isSingle
        ? def.series === "daily"
          ? state.videoTrends.daily
          : state.videoTrends.hourly
        : def.series === "daily"
          ? state.dashboard.dailyHistory
          : state.dashboard.history;
      let value = 0;
      if (isSingle) {
        const last = points[points.length - 1];
        value = last ? Number(last[def.field] || 0) : 0;
      } else {
        value = Number((state.dashboard.cards || {})[def.key] || 0);
      }
      card.innerHTML =
        '<div class="metric-label">' +
        escapeHtml(def.label) +
        "</div>" +
        '<div class="metric-value">' +
        escapeHtml(formatCardValue(def, value)) +
        "<small>" +
        escapeHtml(def.suffix) +
        "</small>" +
        "</div>" +
        (isSingle
          ? '<div class="metric-note">' + escapeHtml(def.note) + "</div>"
          : "") +
        '<canvas data-field="' +
        escapeHtml(def.key) +
        '"></canvas>';
      cardsEl.appendChild(card);
      const canvas = card.querySelector("canvas");
      BiliCharts.renderLineChart(
        canvas,
        points,
        isSingle ? def.field : def.field || def.key,
        def.color,
        chartFormat(def),
        def.label
      );
    });
  }

  function renderTable() {
    const keyword = state.search.trim().toLowerCase();
    const videos = state.rows
      .filter((video) => {
        if (!keyword) return true;
        return (
          String(video.bvid).toLowerCase().includes(keyword) ||
          String(video.title).toLowerCase().includes(keyword) ||
          String(video.owner).toLowerCase().includes(keyword)
        );
      })
      .slice()
      .sort((a, b) => {
        const key = state.sort.key;
        const dir = state.sort.dir;
        const valueA = a[key];
        const valueB = b[key];
        const cmp =
          typeof valueA === "string" && typeof valueB === "string"
            ? valueA.localeCompare(valueB, "zh-CN", {
                numeric: true,
                sensitivity: "base",
              })
            : Number(valueA || 0) - Number(valueB || 0);
        return cmp * dir;
      });

    tableBody.innerHTML = "";
    tableCount.textContent = "共 " + videos.length + " 个视频";
    emptyState.hidden = videos.length > 0;

    videos.forEach((video) => {
      const tr = document.createElement("tr");
      const ownerKey = String(video.owner || "").trim();
      tr.style.backgroundColor = state.ownerColors.get(ownerKey) || "#ffffff";
      tr.innerHTML =
        '<td class="col-owner" title="' +
        escapeHtml(ownerKey) +
        '">' +
        escapeHtml(ownerKey || "未知") +
        "</td>" +
        '<td class="col-bvid"><a class="bvid-link" href="https://www.bilibili.com/video/' +
        escapeHtml(video.bvid) +
        '" target="_blank" rel="noopener">' +
        escapeHtml(video.bvid) +
        "</a></td>" +
        '<td class="col-title" title="' +
        escapeHtml(video.title) +
        '">' +
        escapeHtml(video.title) +
        "</td>" +
        "<td>" + formatInt(video.view) + "</td>" +
        "<td>" + formatInt(video.reply) + "</td>" +
        "<td>" + formatInt(video.like) + "</td>" +
        "<td>" + formatInt(video.coin) + "</td>" +
        "<td>" + formatInt(video.favorite) + "</td>" +
        "<td>" + formatInt(video.share) + "</td>" +
        '<td class="' + (video.hour_plays > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.hour_plays) +
        "</td>" +
        '<td class="' + (video.hour_comments > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.hour_comments) +
        "</td>" +
        '<td class="' + (video.yesterday_plays > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.yesterday_plays) +
        "</td>" +
        '<td class="' + (video.today_plays > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.today_plays) +
        "</td>" +
        '<td class="' + (video.today_comments > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.today_comments) +
        "</td>" +
        '<td class="' + (video.yesterday_comments > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.yesterday_comments) +
        "</td>" +
        "<td>" + video.published_days + " 天</td>" +
        "<td>" + formatInt(video.avg_daily_plays) + "</td>" +
        "<td>" + formatRate(video.comment_rate) + "</td>" +
        "<td>" + formatRate(video.like_rate) + "</td>" +
        "<td>" + formatRate(video.coin_rate) + "</td>" +
        "<td>" + formatRate(video.favorite_rate) + "</td>" +
        "<td>" + formatRate(video.share_rate) + "</td>" +
        '<td class="col-action"><button class="btn btn-danger" data-bvid="' +
        escapeHtml(video.bvid) +
        '" type="button">删除</button></td>';
      tableBody.appendChild(tr);
    });
  }

  function renderStatus() {
    const data = state.data || {};
    let html = "上次更新：" + escapeHtml(data.last_update || "暂无") +
      " · 云端每小时自动更新";
    if (data.last_error) {
      html += '<span class="error-text"> · 最近错误：' + escapeHtml(data.last_error) + "</span>";
    }
    statusLine.innerHTML = html;
  }

  async function loadDashboard(showLoader = true) {
    if (state.loading) return;
    state.loading = true;
    if (showLoader) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "加载中…";
    }
    try {
      const response = await fetch("./data.json?t=" + Date.now());
      if (!response.ok) throw new Error("HTTP " + response.status);
      state.data = await response.json();
      const rows = buildVideoRows(state.data.videos || []);
      state.rows = rows;
      state.ownerColors = buildOwnerColors(rows);
      state.dashboard = {
        cards: buildCards(rows),
        history: buildChartHistory(state.data.videos || [], state.days),
        dailyHistory: buildDailyHistory(state.data.videos || [], state.days),
      };
      populateVideoSelect(rows);
      populateSortSelect();
      updateVideoTrends();
      renderCards();
      renderTable();
      renderStatus();
    } catch (error) {
      setMessage("加载数据失败：" + error.message, "error");
    } finally {
      state.loading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = "刷新数据";
    }
  }

  function openIssue(title, body) {
    const repoUrl = (state.data && state.data.repo_url) || "";
    if (!repoUrl) {
      setMessage("云端仓库尚未配置，暂时不能在线增删视频", "error");
      return;
    }
    const url =
      repoUrl +
      "/issues/new?title=" +
      encodeURIComponent(title) +
      "&body=" +
      encodeURIComponent(body);
    window.open(url, "_blank", "noopener");
    setMessage("已打开 GitHub 提交页面，约一小时内自动生效", "success");
  }

  function addVideo(bvid) {
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) {
      setMessage("BV号格式不正确，示例：BV1o9uy6jEyM", "error");
      return;
    }
    openIssue("添加视频 " + bvid, "请添加视频：" + bvid);
  }

  function deleteVideo(bvid) {
    if (!window.confirm("确定从跟踪列表中删除 " + bvid + " 吗？")) {
      return;
    }
    openIssue("删除视频 " + bvid, "请删除视频：" + bvid);
  }

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    renderTable();
  });

  refreshBtn.addEventListener("click", () => loadDashboard(true));

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const bvid = bvInput.value.trim();
    bvInput.value = "";
    addVideo(bvid);
  });

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bvid]");
    if (button) deleteVideo(button.dataset.bvid);
  });

  tableHead.addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (state.sort.key === key) {
      state.sort.dir *= -1;
    } else {
      state.sort.key = key;
      state.sort.dir = defaultDirFor(key);
    }
    updateSortControl();
    renderTable();
  });

  videoSelect.addEventListener("change", () => {
    state.selectedBvid = videoSelect.value;
    updateVideoTrends();
    renderCards();
  });

  sortSelect.addEventListener("change", () => {
    state.sort.key = sortSelect.value;
    state.sort.dir = defaultDirFor(state.sort.key);
    updateSortControl();
    renderTable();
  });

  sortDirBtn.addEventListener("click", () => {
    state.sort.dir *= -1;
    updateSortControl();
    renderTable();
  });

  periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      periodButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.days = Number(button.dataset.days);
      if (state.data) {
        state.dashboard.history = buildChartHistory(state.data.videos || [], state.days);
        state.dashboard.dailyHistory = buildDailyHistory(state.data.videos || [], state.days);
        updateVideoTrends();
        renderCards();
      }
    });
  });

  loadDashboard();
  window.setInterval(() => loadDashboard(false), 60000);
})();
