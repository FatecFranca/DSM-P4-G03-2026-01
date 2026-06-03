(function () {
  "use strict";

  // ── Config ───────────────────────────────────────────────────────────
  var API_BASE = window.location.origin;
  var POLL_INTERVAL_MS = 30_000;
  var RECENT_LIMIT = 15;

  // ── DOM refs ─────────────────────────────────────────────────────────
  var statusEl = document.getElementById("dashboard-status");
  var statusText = document.getElementById("status-text");

  var statTotal = document.getElementById("stat-total-activations");
  var statLocations = document.getElementById("stat-unique-locations");
  var statAvgArrival = document.getElementById("stat-avg-arrival");
  var badgeActivations = document.getElementById("badge-activations");

  var tableBody = document.getElementById("table-body");
  var tableEmpty = document.getElementById("table-empty");

  var chartDailyCanvas = document.getElementById("chart-daily");
  var chartDonutCanvas = document.getElementById("chart-donut");
  var chartNeighborhoodsCanvas = document.getElementById("chart-neighborhoods");

  var chartDaily = null;
  var donutCharts = { locations: null, neighborhoods: null };

  var DONUT_COLORS = ["#f6b4c0", "#d08fb8", "#b77aa8", "#ebb6d0", "#c99ab8", "#e8a4bc"];
  var pollTimer = null;

  // ── Status helpers ───────────────────────────────────────────────────
  function showLoading() {
    statusEl.classList.remove("hidden", "error");
    statusText.textContent = "Carregando dados do dashboard...";
  }

  function showError(message) {
    statusEl.classList.remove("hidden");
    statusEl.classList.add("error");
    statusText.textContent = message || "Erro ao carregar dados.";
  }

  function hideStatus() {
    statusEl.classList.add("hidden");
  }

  // ── Formatting helpers ───────────────────────────────────────────────
  function formatArrivalTime(seconds) {
    if (seconds === null || seconds === undefined) return "—";
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return mins + " min " + secs + " seg";
    }
    return secs + " seg";
  }

  function formatDateLabel(isoDate) {
    var parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    return parts[2] + "/" + parts[1];
  }

  /**
   * Gera URL do iframe do OpenStreetMap para o mini-mapa.
   * Usamos um wrapper com overflow:hidden + clip para esconder a barra de atribuição.
   */
  function buildMapIframeUrl(lat, lng) {
    var delta = 0.002;
    var left = lng - delta;
    var bottom = lat - delta;
    var right = lng + delta;
    var top = lat + delta;
    return (
      "https://www.openstreetmap.org/export/embed.html" +
      "?bbox=" + left.toFixed(6) + "%2C" + bottom.toFixed(6) + "%2C" + right.toFixed(6) + "%2C" + top.toFixed(6) +
      "&layer=mapnik" +
      "&marker=" + lat.toFixed(6) + "%2C" + lng.toFixed(6)
    );
  }

  // ── Render functions ─────────────────────────────────────────────────

  function renderSummary(data) {
    statTotal.textContent = data.totalActivations.toLocaleString();
    statLocations.textContent = data.uniqueLocations.toLocaleString();
    statAvgArrival.textContent = formatArrivalTime(data.averageArrivalTimeSeconds);
    var activeCount = data.activeAlertsCount;
    badgeActivations.textContent = activeCount > 0 ? "+" + activeCount : "0";
  }

  function renderDailyChart(daily) {
    if (chartDaily) { chartDaily.destroy(); chartDaily = null; }

    var labels = daily.map(function (d) { return formatDateLabel(d.date); });
    var values = daily.map(function (d) { return d.count; });

    chartDaily = new Chart(chartDailyCanvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Ativações",
          data: values,
          borderColor: "#ea8ea1",
          backgroundColor: "rgba(243, 167, 185, 0.22)",
          borderWidth: 3,
          pointBackgroundColor: "#f8f2f5",
          pointBorderColor: "#ed89a0",
          pointBorderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.35,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: "rgba(208, 186, 196, 0.28)" },
            ticks: { color: "#9a7a7e", font: { size: 11, weight: "600" } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(208, 186, 196, 0.28)" },
            ticks: { color: "#9a7a7e", font: { size: 11, weight: "600" }, stepSize: 1 },
          },
        },
      },
    });
  }

  function renderDonutChart(canvas, frequent, chartKey) {
    if (donutCharts[chartKey]) {
      donutCharts[chartKey].destroy();
      donutCharts[chartKey] = null;
    }

    if (!canvas || !frequent || frequent.length === 0) {
      return;
    }

    var labels = frequent.map(function (f) { return f.label; });
    var values = frequent.map(function (f) { return f.count; });
    var percentages = frequent.map(function (f) { return f.percentage; });
    var colors = DONUT_COLORS.slice(0, labels.length);

    donutCharts[chartKey] = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: "#fff6f9",
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "55%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#9a7a7e", font: { size: 12, weight: "600" }, padding: 16, usePointStyle: true },
          },
          tooltip: {
            backgroundColor: "#fff6f9",
            titleColor: "#5a3a3f",
            bodyColor: "#5a3a3f",
            borderColor: "#f3a7b9",
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              label: function (ctx) {
                var idx = ctx.dataIndex;
                return labels[idx] + ": " + values[idx] + " (" + percentages[idx] + "%)";
              },
            },
          },
        },
      },
    });
  }

  function renderTable(recent) {
    tableBody.innerHTML = "";

    if (recent.length === 0) {
      tableEmpty.hidden = false;
      return;
    }

    tableEmpty.hidden = true;

    var svgPin =
      '<svg viewBox="0 0 24 24" role="presentation">' +
      '<path d="M12 2C8.14 2 5 5.14 5 9c0 4.83 7 13 7 13s7-8.17 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />' +
      "</svg>";

    for (var i = 0; i < Math.min(recent.length, RECENT_LIMIT); i++) {
      var alert = recent[i];
      var row = document.createElement("div");
      row.className = "table-row";
      row.setAttribute("role", "row");

      var hasLocation = alert.lat !== 0 || alert.lng !== 0;
      var mapUrl = hasLocation ? buildMapIframeUrl(alert.lat, alert.lng) : null;
      var label = alert.locationLabel || "Sem localização";

      // Map wrapper: uses overflow:hidden + clip to hide the OSM attribution bar
      var mapHtml = mapUrl
        ? '<div class="mini-map-wrap">' +
          '<iframe class="mini-map" src="' + mapUrl + '" ' +
          'sandbox="allow-scripts allow-same-origin" ' +
          'loading="lazy" ' +
          'title="Mapa da localização"></iframe>' +
          '</div>'
        : "";

      row.innerHTML =
        '<div role="cell">' + alert.date + "</div>" +
        '<div role="cell">' + alert.time + "</div>" +
        '<div role="cell" class="location-cell">' +
        '<div class="location-line">' +
        '<span class="mini-pin" aria-hidden="true">' + svgPin + "</span>" +
        "<span>" + escapeHtml(label) + "</span>" +
        "</div>" +
        mapHtml +
        "</div>" +
        '<div role="cell">' +
        formatArrivalTime(alert.arrivalTimeSeconds) +
        (alert.status === "active" ? '<span class="status-tag active">Ativo</span>' : "") +
        "</div>";

      tableBody.appendChild(row);
    }
  }

  function escapeHtml(text) {
    var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(text).replace(/[&<>"']/g, function (ch) { return map[ch]; });
  }

  // ── Fetch ────────────────────────────────────────────────────────────

  function fetchDashboard() {
    fetch(API_BASE + "/admin/dashboard")
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var msg =
              data && data.error && data.error.message
                ? data.error.message
                : "HTTP " + res.status + " " + res.statusText;
            throw new Error(msg);
          }
          return data;
        });
      })
      .then(function (data) {
        hideStatus();
        renderSummary(data);
        renderDailyChart(data.dailyActivations);
        renderDonutChart(chartDonutCanvas, data.frequentLocations, "locations");
        renderDonutChart(chartNeighborhoodsCanvas, data.frequentNeighborhoods || [], "neighborhoods");
        renderTable(data.recentAlerts);
      })
      .catch(function (err) {
        console.error("Dashboard fetch error:", err);
        var hint =
          err && err.message && err.message.indexOf("HTTP") !== 0
            ? err.message
            : "Não foi possível carregar os dados. Abra o painel em " +
              API_BASE +
              "/adm e confira se a API está no ar (health: " +
              API_BASE +
              "/health).";
        showError(hint);
      });
  }

  // ── Init ─────────────────────────────────────────────────────────────

  function start() {
    showLoading();
    fetchDashboard();
    pollTimer = setInterval(fetchDashboard, POLL_INTERVAL_MS);
  }

  function waitForChart(cb) {
    if (typeof Chart !== "undefined") { cb(); }
    else { setTimeout(function () { waitForChart(cb); }, 100); }
  }

  waitForChart(start);
})();
