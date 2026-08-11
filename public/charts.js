(function () {
  "use strict";

  const tooltip = document.getElementById("chartTooltip");
  const activeCharts = [];

  function formatCompact(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "0";
    const abs = Math.abs(value);
    if (abs >= 100000000) return (value / 100000000).toFixed(2) + "亿";
    if (abs >= 10000) return (value / 10000).toFixed(1) + "万";
    return value.toLocaleString("zh-CN");
  }

  function formatPercent(value) {
    return Number(value).toFixed(2) + "%";
  }

  function shortHour(hour) {
    return hour.slice(5);
  }

  function clearCharts() {
    activeCharts.length = 0;
  }

  function renderLineChart(canvas, points, field, color, formatValue) {
    if (!canvas || !points || points.length === 0) {
      const ctx = canvas && canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#8a9aa0";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("暂无数据", canvas.width / 2, canvas.height / 2);
      }
      return;
    }

    const values = points.map((point) => Number(point[field] || 0));
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (min === max) {
      min = min > 0 ? min * 0.98 : 0;
      max = max > 0 ? max * 1.02 : 1;
    }
    const range = max - min || 1;
    min -= range * 0.08;
    max += range * 0.08;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(80, rect.width);
      const height = Math.max(40, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const padL = 38;
      const padR = 8;
      const padT = 8;
      const padB = 16;
      const plotW = width - padL - padR;
      const plotH = height - padT - padB;

      const x = (index) =>
        padL + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
      const y = (value) => padT + plotH - ((value - min) / (max - min)) * plotH;

      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#8a9aa0";
      ctx.strokeStyle = "#e2eaec";
      ctx.lineWidth = 1;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      const tickCount = 3;
      for (let i = 0; i <= tickCount; i++) {
        const tickValue = min + ((max - min) / tickCount) * i;
        const tickY = y(tickValue);
        ctx.beginPath();
        ctx.moveTo(padL, tickY);
        ctx.lineTo(width - padR, tickY);
        ctx.stroke();
        ctx.fillText(formatCompact(tickValue), padL - 5, tickY);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(shortHour(points[0].time), padL, height - 4);
      ctx.textAlign = "right";
      if (points.length > 1) {
        ctx.fillText(shortHour(points[points.length - 1].time), width - padR, height - 4);
      }

      const coords = points.map((point, index) => ({
        x: x(index),
        y: y(Number(point[field] || 0)),
        point: point,
      }));

      ctx.beginPath();
      coords.forEach((coord, index) => {
        if (index === 0) ctx.moveTo(coord.x, coord.y);
        else ctx.lineTo(coord.x, coord.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      const gradient = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      gradient.addColorStop(0, color + "2e");
      gradient.addColorStop(1, color + "00");
      ctx.lineTo(coords[coords.length - 1].x, padT + plotH);
      ctx.lineTo(coords[0].x, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      coords.forEach((coord) => {
        ctx.beginPath();
        ctx.arc(coord.x, coord.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      });
    };

    draw();

    const onMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(80, rect.width);
      const padL = 38;
      const padR = 8;
      const plotW = width - padL - padR;
      const normalized = (mouseX - padL) / plotW;
      const index = Math.max(
        0,
        Math.min(
          points.length - 1,
          Math.round(normalized * (points.length - 1))
        )
      );
      const point = points[index];
      const value = formatValue ? formatValue(point[field]) : formatCompact(point[field]);
      tooltip.innerHTML =
        "<div>" + point.time + "</div><div>" + value + "</div>";
      tooltip.hidden = false;
      const tooltipX = event.clientX + 12;
      const tooltipY = event.clientY;
      tooltip.style.left = tooltipX + "px";
      tooltip.style.top = tooltipY + "px";
    };

    const onLeave = () => {
      tooltip.hidden = true;
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const chart = {
      canvas: canvas,
      redraw: draw,
    };
    activeCharts.push(chart);

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => draw());
      observer.observe(canvas);
      chart.observer = observer;
    }
  }

  window.BiliCharts = {
    renderLineChart: renderLineChart,
    clearCharts: clearCharts,
    formatCompact: formatCompact,
    formatPercent: formatPercent,
  };
})();
