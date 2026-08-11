(function () {
  "use strict";

  const state = {
    data: null,
    dashboard: null,
    search: "",
    days: 30,
    loading: false,
  };

  const CARD_DEFS = [
    { key: "video_count", label: "视频数", color: "#0f766e", suffix: "个" },
    { key: "total_plays", label: "总播放", color: "#2563eb", suffix: "" },
    { key: "total_comments", label: "总评论", color: "#7c3aed", suffix: "" },
    { key: "comment_rate", label: "平均评论率", color: "#0891b2", suffix: "%" },
    { key: "like_rate", label: "平均点赞率", color: "#d97706", suffix: "%" },
    { key: "coin_rate", label: "平均投币率", color: "#059669", suffix: "%" },
    { key: "favorite_rate", label: "平均收藏率", color: "#db2777", suffix: "%" },
    { key: "share_rate", label: "平均分享率", color: "#4f46e5", suffix: "%" },
  ];

  const cardsEl = document.getElementById("cards");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const addForm = document.getElementById("addForm");
  const bvInput = document.getElementById("bvInput");
  const messageEl = document.getElementById("message");
  const statusLine = document.getElementById("statusLine");
  const tableBody = document.getElementById("videoTableBody");
  const tableCount = document.getElementById("tableCount");
  const emptyState = document.getElementById("emptyState");
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

  function cnDatePrefix() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return parts;
  }

  function hourToTs(hour) {
    const parts = hour.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):00$/);
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

  function buildVideoRows(videos) {
    const todayPrefix = cnDatePrefix();
    const nowSec = Math.floor(Date.now() / 1000);
    return videos.map((video) => {
      const history = video.history || [];
      const latest = history[history.length - 1] || {};
      const previous = history[history.length - 2];
      const view = Number(latest.view || 0);
      const hourPlays = previous
        ? Math.max(0, view - Number(previous.view || 0))
        : 0;

      const earliestTodayIndex = history.findIndex((item) =>
        item.time.startsWith(todayPrefix)
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

      return {
        bvid: video.bvid,
        title: video.title || "等待首次抓取",
        owner: video.owner || "",
        pubdate: pubdate,
        view: view,
        reply: reply,
        like: like,
        coin: coin,
        favorite: favorite,
        share: share,
        hour_plays: hourPlays,
        today_plays: todayPlays,
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
    return {
      video_count: rows.length,
      total_plays: totalPlays,
      total_comments: totalComments,
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
      history: (video.history || []).sort((a, b) => (a.time < b.time ? -1 : 1)),
      index: -1,
    }));

    return hours.map((hour) => {
      const included = [];
      pointers.forEach((pointer) => {
        while (
          pointer.index + 1 < pointer.history.length &&
          pointer.history[pointer.index + 1].time <= hour
        ) {
          pointer.index += 1;
        }
        if (pointer.index >= 0) {
          included.push(pointer.history[pointer.index]);
        }
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

  function renderCards() {
    const cards = state.dashboard.cards;
    const history = state.dashboard.history || [];
    BiliCharts.clearCharts();
    cardsEl.innerHTML = "";

    CARD_DEFS.forEach((def) => {
      const card = document.createElement("article");
      card.className = "metric-card";
      const value = Number(cards[def.key] || 0);
      const valueText =
        def.key.endsWith("_rate")
          ? value.toFixed(2)
          : BiliCharts.formatCompact(value);
      card.innerHTML =
        '<div class="metric-label">' +
        escapeHtml(def.label) +
        "</div>" +
        '<div class="metric-value">' +
        escapeHtml(valueText) +
        "<small>" +
        escapeHtml(def.suffix) +
        "</small>" +
        "</div>" +
        '<canvas data-field="' +
        def.key +
        '"></canvas>';
      cardsEl.appendChild(card);
      const canvas = card.querySelector("canvas");
      BiliCharts.renderLineChart(
        canvas,
        history,
        def.key,
        def.color,
        def.key.endsWith("_rate") ? formatRate : formatInt
      );
    });
  }

  function renderTable() {
    const keyword = state.search.trim().toLowerCase();
    const videos = (state.dashboard.videos || []).filter((video) => {
      if (!keyword) return true;
      return (
        String(video.bvid).toLowerCase().includes(keyword) ||
        String(video.title).toLowerCase().includes(keyword)
      );
    });

    tableBody.innerHTML = "";
    tableCount.textContent = "共 " + videos.length + " 个视频";
    emptyState.hidden = videos.length > 0;

    videos.forEach((video) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
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
        '<td class="' + (video.today_plays > 0 ? "num-strong" : "num-muted") + '">' +
        formatInt(video.today_plays) +
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
      state.dashboard = {
        videos: rows,
        cards: buildCards(rows),
        history: buildChartHistory(state.data.videos || [], state.days),
      };
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

  periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      periodButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.days = Number(button.dataset.days);
      if (state.data) {
        state.dashboard.history = buildChartHistory(state.data.videos || [], state.days);
        renderCards();
      }
    });
  });

  loadDashboard();
  window.setInterval(() => loadDashboard(false), 60000);
})();
