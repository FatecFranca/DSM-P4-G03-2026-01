(() => {
  // ── Config ───────────────────────────────────────────────────────────
  const API_BASE = window.location.origin;
  const POLL_INTERVAL_MS = 5_000;
  const RECENT_LIMIT = 15;
  const NEIGHBORHOOD_VISIBLE_LIMIT = 5;

  // ── DOM refs ─────────────────────────────────────────────────────────
  const statusEl = document.getElementById("dashboard-status");
  const statusText = document.getElementById("status-text");

  const statTotal = document.getElementById("stat-total-activations");
  const statLocations = document.getElementById("stat-unique-locations");
  const statAvgArrival = document.getElementById("stat-avg-arrival");
  const badgeActivations = document.getElementById("badge-activations");

  const tableBody = document.getElementById("table-body");
  const tableEmpty = document.getElementById("table-empty");
  const refreshBtn = document.getElementById("refresh-btn");

  const chartDailyCanvas = document.getElementById("chart-daily");
  const neighborhoodListEl = document.getElementById("neighborhood-list");

  let chartDaily = null;
  let pollTimer = null;
  let lastNeighborhoodsKey = null;
  let neighborhoodsExpanded = false;

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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins} min ${secs} seg`;
    }
    return `${secs} seg`;
  }

  function formatDateLabel(isoDate) {
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}`;
  }

  /**
   * Gera URL do iframe do OpenStreetMap para o mini-mapa.
   * Usamos um wrapper com overflow:hidden + clip para esconder a barra de atribuição.
   */
  function buildMapIframeUrl(lat, lng) {
    const delta = 0.002;
    const left = lng - delta;
    const bottom = lat - delta;
    const right = lng + delta;
    const top = lat + delta;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${left.toFixed(6)}%2C${bottom.toFixed(6)}%2C${right.toFixed(6)}%2C${top.toFixed(6)}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
  }

  // ── Render functions ─────────────────────────────────────────────────

  function renderSummary(data) {
    statTotal.textContent = data.totalActivations.toLocaleString();
    statLocations.textContent = data.uniqueLocations.toLocaleString();
    statAvgArrival.textContent = formatArrivalTime(
      data.averageArrivalTimeSeconds,
    );
    const activeCount = data.activeAlertsCount;
    badgeActivations.textContent = activeCount > 0 ? `+${activeCount}` : "0";
  }

  function renderDailyChart(daily) {
    if (chartDaily) {
      chartDaily.destroy();
      chartDaily = null;
    }

    const labels = daily.map((d) => formatDateLabel(d.date));
    const values = daily.map((d) => d.count);

    chartDaily = new Chart(chartDailyCanvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
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
          },
        ],
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
            ticks: {
              color: "#9a7a7e",
              font: { size: 11, weight: "600" },
              stepSize: 1,
            },
          },
        },
      },
    });
  }

  function renderNeighborhoodList(neighborhoods) {
    if (!neighborhoodListEl) return;

    if (!neighborhoods || neighborhoods.length === 0) {
      neighborhoodsExpanded = false;
      lastNeighborhoodsKey = null;
      neighborhoodListEl.innerHTML =
        '<li class="nb-empty">Nenhum bairro registrado ainda.</li>';
      return;
    }

    // Evita re-renderizar (e perder o estado expandir/recolher) quando o poll
    // retorna exatamente os mesmos dados.
    const key = JSON.stringify(neighborhoods);
    if (key === lastNeighborhoodsKey) return;
    lastNeighborhoodsKey = key;

    const maxCount = neighborhoods[0]?.count ?? 0;
    const hasMore = neighborhoods.length > NEIGHBORHOOD_VISIBLE_LIMIT;

    const renderItem = (item, index, hidden) => {
      // Barra proporcional ao maior da lista (não ao total), para dar
      // contraste visual entre os bairros do ranking.
      const barWidth =
        maxCount > 0
          ? Math.max(4, Math.round((item.count / maxCount) * 100))
          : 0;
      const hiddenClass = hidden ? " nb-item--hidden" : "";
      return `
        <li class="nb-item${hiddenClass}">
          <span class="nb-rank">${index + 1}</span>
          <div class="nb-main">
            <div class="nb-top">
              <span class="nb-name">${escapeHtml(item.label)}</span>
              <span class="nb-count">${item.count} alerta${
                item.count !== 1 ? "s" : ""
              }</span>
            </div>
            <div class="nb-bar">
              <span class="nb-bar-fill" style="width:${barWidth}%"></span>
            </div>
          </div>
          <span class="nb-pct">${item.percentage}%</span>
        </li>`;
    };

    const visible = neighborhoods.slice(0, NEIGHBORHOOD_VISIBLE_LIMIT);
    const extra = neighborhoods.slice(NEIGHBORHOOD_VISIBLE_LIMIT);

    let html = visible
      .map((item, index) => renderItem(item, index, false))
      .join("");

    if (hasMore) {
      html += extra
        .map((item, index) =>
          renderItem(
            item,
            NEIGHBORHOOD_VISIBLE_LIMIT + index,
            !neighborhoodsExpanded,
          ),
        )
        .join("");

      html += `
        <li class="nb-toggle-item">
          <button type="button" class="nb-toggle" aria-expanded="${neighborhoodsExpanded}">
            <span class="nb-toggle-label">${
              neighborhoodsExpanded
                ? "Mostrar menos"
                : `Mostrar mais ${extra.length} bairros`
            }</span>
            <span class="nb-toggle-arrow" aria-hidden="true">${
              neighborhoodsExpanded ? "▲" : "▼"
            }</span>
          </button>
        </li>`;
    }

    neighborhoodListEl.innerHTML = html;

    const toggle = neighborhoodListEl.querySelector(".nb-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        neighborhoodsExpanded = !neighborhoodsExpanded;
        renderNeighborhoodList(neighborhoods);
      });
    }
  }

  function renderTable(recent) {
    tableBody.innerHTML = "";

    if (recent.length === 0) {
      tableEmpty.hidden = false;
      return;
    }

    tableEmpty.hidden = true;

    const svgPin =
      '<svg viewBox="0 0 24 24" role="presentation">' +
      '<path d="M12 2C8.14 2 5 5.14 5 9c0 4.83 7 13 7 13s7-8.17 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />' +
      "</svg>";

    for (let i = 0; i < Math.min(recent.length, RECENT_LIMIT); i++) {
      const alert = recent[i];
      const row = document.createElement("div");
      row.className = "table-row";
      row.setAttribute("role", "row");

      const hasLocation = alert.lat !== 0 || alert.lng !== 0;
      const mapUrl = hasLocation
        ? buildMapIframeUrl(alert.lat, alert.lng)
        : null;
      const label = alert.locationLabel || "Sem localização";

      // Map wrapper: uses overflow:hidden + clip to hide the OSM attribution bar
      const mapHtml = mapUrl
        ? `<div class="mini-map-wrap"><iframe class="mini-map" src="${mapUrl}" sandbox="allow-scripts allow-same-origin" loading="lazy" title="Mapa da localização"></iframe></div>`
        : "";

      row.innerHTML = `<div role="cell">${alert.date}</div><div role="cell">${alert.time}</div><div role="cell" class="location-cell"><div class="location-line"><span class="mini-pin" aria-hidden="true">${svgPin}</span><span>${escapeHtml(label)}</span></div>${mapHtml}</div><div role="cell">${formatArrivalTime(alert.arrivalTimeSeconds)}${
        alert.status === "active"
          ? '<span class="status-tag active">Ativo</span>'
          : ""
      }</div>`;

      tableBody.appendChild(row);
    }
  }

  function escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return String(text).replace(/[&<>"']/g, (ch) => map[ch]);
  }

  // ── Fetch ────────────────────────────────────────────────────────────

  let fetchInFlight = false;

  function setRefreshPending(pending) {
    if (!refreshBtn) return;
    refreshBtn.disabled = pending;
    refreshBtn.classList.toggle("is-pending", pending);
    refreshBtn.textContent = pending ? "Atualizando…" : "Atualizar";
  }

  function fetchDashboard() {
    if (fetchInFlight) return;
    fetchInFlight = true;
    setRefreshPending(true);

    fetch(`${API_BASE}/admin/dashboard`)
      .then((res) =>
        res.json().then((data) => {
          if (!res.ok) {
            const msg = data?.error?.message
              ? data.error.message
              : `HTTP ${res.status} ${res.statusText}`;
            throw new Error(msg);
          }
          return data;
        }),
      )
      .then((data) => {
        hideStatus();
        renderSummary(data);
        renderDailyChart(data.dailyActivations);
        renderNeighborhoodList(data.frequentNeighborhoods || []);
        renderTable(data.recentAlerts);
      })
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        const hint =
          err?.message && err.message.indexOf("HTTP") !== 0
            ? err.message
            : `Não foi possível carregar os dados. Abra o painel em ${API_BASE}/adm e confira se a API está no ar (health: ${API_BASE}/health).`;
        showError(hint);
      })
      .finally(() => {
        fetchInFlight = false;
        setRefreshPending(false);
      });
  }

  // ── Init ─────────────────────────────────────────────────────────────

  function start() {
    showLoading();
    fetchDashboard();
    pollTimer = setInterval(fetchDashboard, POLL_INTERVAL_MS);
    if (refreshBtn) {
      refreshBtn.addEventListener("click", fetchDashboard);
    }
  }

  function waitForChart(cb) {
    if (typeof Chart !== "undefined") {
      cb();
    } else {
      setTimeout(() => {
        waitForChart(cb);
      }, 100);
    }
  }

  waitForChart(start);
})();
