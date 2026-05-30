// Usa a mesma origem da página — funciona local e em produção
const API_URL = window.location.origin;

/* ==========================================================================
   Utilitários
   ========================================================================== */

/** Escapa HTML para prevenir XSS ao inserir dados da API no DOM */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ==========================================================================
   Cards de resumo (Dados Gerais)
   ========================================================================== */

const cards = [
  { id: "users", fallback: "--" },
  { id: "alerts", fallback: "--" },
  { id: "devices", fallback: "--" },
];

async function loadDashboard() {
  try {
    const response = await fetch(`${API_URL}/dashboard/stats`);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();

    for (const card of cards) {
      const el = document.getElementById(card.id);
      if (!el) continue;

      // Remove estado de erro se existia
      el.closest(".stat-card")?.classList.remove("is-error");
      el.innerText = data[card.id] ?? card.fallback;
    }

    console.log("Dashboard atualizado:", data);
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);

    // Sinaliza visualmente que a API está indisponível
    for (const card of cards) {
      const el = document.getElementById(card.id);
      if (!el) continue;

      el.closest(".stat-card")?.classList.add("is-error");
      el.innerText = "Erro";
    }
  }
}

loadDashboard();

/* ==========================================================================
   Mini-mapa SVG (renderizado no cliente)
   ========================================================================== */

// Gera um mini mapa SVG estilizado com grid de ruas, área de cobertura e marcador
function renderMap(r) {
  if (r.lat == null || r.lng == null) return "";

  // Usa as coordenadas para gerar uma seed determinística (grid varia por local)
  const seed = Math.round(Math.abs(r.lat) * 1e4 + Math.abs(r.lng) * 1e4);

  // Gera linhas de "ruas" pseudo-aleatórias mas estáveis por coordenada
  const pseudoRandom = (n) => ((n * 2654435761) >>> 0) % 100;

  // Posição do marcador no centro
  const mx = 155;
  const my = 60;

  // Gera ruas horizontais
  let hStreets = "";
  for (let i = 0; i < 6; i++) {
    const y = 8 + i * 22 + (pseudoRandom(seed + i) % 12);
    const dash = pseudoRandom(seed + 100 + i) > 50 ? "12 8" : "20 10";
    hStreets += `<line x1="0" x2="310" y1="${y}" y2="${y}" stroke="#e8d4da" stroke-width="${1 + (i % 3)}" stroke-dasharray="${dash}" opacity="0.9"/>`;
  }

  // Gera ruas verticais
  let vStreets = "";
  for (let i = 0; i < 8; i++) {
    const x = 10 + i * 40 + (pseudoRandom(seed + 200 + i) % 20);
    const dash = pseudoRandom(seed + 300 + i) > 40 ? "8 6" : "18 12";
    vStreets += `<line x1="${x}" x2="${x}" y1="0" y2="108" stroke="#e8d4da" stroke-width="${1 + (i % 3)}" stroke-dasharray="${dash}" opacity="0.85"/>`;
  }

  // Gera blocos de construção (retângulos entre ruas)
  let buildings = "";
  for (let i = 0; i < 12; i++) {
    const bx = 18 + (i * 23) % 270;
    const by = 6 + (i * 31) % 90;
    const bw = 8 + pseudoRandom(seed + 400 + i * 3) % 14;
    const bh = 6 + pseudoRandom(seed + 500 + i * 5) % 10;
    const alpha = 0.25 + (pseudoRandom(seed + 600 + i) % 30) / 100;
    buildings += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="1.5" fill="#dbb8c4" opacity="${alpha}"/>`;
  }

  // Gera o caminho da rota (curva estilizada até o marcador)
  const routeStartX = 30 + pseudoRandom(seed + 700) % 40;
  const routeStartY = 90 + pseudoRandom(seed + 800) % 10;
  const routeCpx = routeStartX + pseudoRandom(seed + 900) % 60;
  const routeCpy = routeStartY - pseudoRandom(seed + 1000) % 30;

  return `
    <svg class="map-card" viewBox="0 0 310 108" aria-label="Mapa: ${escapeHtml(r.localizacao)}" role="img">
      <defs>
        <linearGradient id="mapBg${seed}" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fefafb"/>
          <stop offset="100%" stop-color="#fdf4f7"/>
        </linearGradient>
        <radialGradient id="ping${seed}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#e85d75" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#e85d75" stop-opacity="0"/>
        </radialGradient>
        <filter id="glow${seed}">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <!-- Background -->
      <rect width="310" height="108" rx="10" fill="url(#mapBg${seed})"/>

      <!-- Grid de ruas -->
      ${hStreets}
      ${vStreets}

      <!-- Blocos de construção -->
      ${buildings}

      <!-- Área de pulsação (zona de cobertura) -->
      <circle cx="${mx}" cy="${my}" r="28" fill="url(#ping${seed})">
        <animate attributeName="r" values="22;36;22" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite"/>
      </circle>

      <!-- Rota de aproximação -->
      <path d="M${routeStartX} ${routeStartY} Q${routeCpx} ${routeCpy} ${mx} ${my}"
            fill="none" stroke="#e85d75" stroke-width="2" stroke-dasharray="4 3"
            opacity="0.5" stroke-linecap="round"/>

      <!-- Pino do marcador -->
      <circle cx="${mx}" cy="${my}" r="6" fill="#fff" filter="url(#glow${seed})"/>
      <circle cx="${mx}" cy="${my}" r="4" fill="#e85d75">
        <animate attributeName="r" values="3.5;5;3.5" dur="1.5s" repeatCount="indefinite"/>
      </circle>

      <!-- Label no rodapé -->
      <text x="155" y="102" text-anchor="middle" font-size="9" fill="#b08a94" font-family="Poppins, sans-serif" font-weight="600">${escapeHtml(r.localizacao)}</text>
    </svg>`;
}

/* ==========================================================================
   Alertas recentes + Pipeline (unificado — única chamada à API)
   ========================================================================== */

// Cache compartilhado entre as funções de tabela e pipeline
let latestAlerts = [];

async function fetchRecentAlerts() {
  try {
    const response = await fetch(`${API_URL}/dashboard/recent-alerts`);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    latestAlerts = await response.json();
    return latestAlerts;
  } catch (error) {
    console.error("Erro ao carregar alertas recentes:", error);
    latestAlerts = [];
    return [];
  }
}

// Tabela de estatísticas gerais
function renderRecentAlertsTable(rows) {
  const tbody = document.getElementById("stats-tbody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML =
      '<div class="table-row" role="row"><div role="cell" style="grid-column:1/-1;text-align:center;padding:2rem">Nenhum alerta registrado</div></div>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (r) => `
    <div class="table-row" role="row">
      <div role="cell">${escapeHtml(r.data)}</div>
      <div role="cell">${escapeHtml(r.hora)}</div>
      <div role="cell" class="location-cell">
        <div class="location-line">
          <span class="mini-pin" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="presentation">
              <path d="M12 2C8.14 2 5 5.14 5 9c0 4.83 7 13 7 13s7-8.17 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
            </svg>
          </span>
          <span>${escapeHtml(r.localizacao)}</span>
        </div>
        ${renderMap(r)}
      </div>
      <div role="cell">${escapeHtml(r.tempoChegada)}</div>
    </div>`,
    )
    .join("");

  console.log("Tabela de alertas atualizada:", rows.length, "registros");
}

// Pipeline "Como Funciona" — preenche com dados do alerta mais recente
function renderPipeline(rows) {
  if (!rows.length) return;

  const latest = rows[0];

  // Ativa todos os steps e depois marca como completos
  document.querySelectorAll(".pipeline-step").forEach((el) => {
    el.classList.add("active");
    // Pequeno delay para a transição visual
    setTimeout(() => {
      el.classList.add("completed");
    }, 300);
  });

  // Step 1 — Toque na Joia
  setPipelineData("step1-data", [
    `Usuária: <strong>${escapeHtml(latest.usuario)}</strong>`,
    `Modo: <strong>${latest.modo === "discreet" ? "Discreto 🔇" : "Visível 📢"}</strong>`,
  ]);

  // Step 2 — Localização Enviada
  setPipelineData("step2-data", [
    `📍 <strong>${escapeHtml(latest.localizacao)}</strong>`,
  ]);

  // Step 3 — Contatos Notificados
  setPipelineData("step3-data", [
    `Risco: <strong>${latest.risco === "high" ? "Alto ⚠️" : "Normal"}</strong>`,
    `Push enviada aos contatos`,
  ]);

  // Step 4 — Dashboard
  setPipelineData("step4-data", [
    `⏱️ Resposta em <strong>${escapeHtml(latest.tempoChegada)}</strong>`,
  ]);

  // Live alert banner
  const liveBody = document.getElementById("live-alert-body");
  if (liveBody) {
    liveBody.innerHTML = `
      <div class="live-stat">
        <span class="live-stat-label">Usuária</span>
        <span class="live-stat-value">${escapeHtml(latest.usuario)}</span>
      </div>
      <div class="live-stat">
        <span class="live-stat-label">Localização</span>
        <span class="live-stat-value">${escapeHtml(latest.localizacao)}</span>
      </div>
      <div class="live-stat">
        <span class="live-stat-label">Tempo de Resposta</span>
        <span class="live-stat-value mono">${escapeHtml(latest.tempoChegada)}</span>
      </div>
      <div class="live-stat">
        <span class="live-stat-label">Status</span>
        <span class="live-stat-value">🟢 Monitorando</span>
      </div>`;
  }

  console.log("Pipeline atualizado com:", latest.usuario);
}

function setPipelineData(stepId, lines) {
  const container = document.getElementById(stepId);
  if (!container) return;
  container.classList.add("highlight");
  container.innerHTML = lines.join("<br>");
}

// Função unificada que carrega os dados uma vez e alimenta tabela + pipeline
async function loadAlertsAndPipeline() {
  const rows = await fetchRecentAlerts();
  renderRecentAlertsTable(rows);
  renderPipeline(rows);
}

loadAlertsAndPipeline();

/* ==========================================================================
   Frequência de acionamentos
   ========================================================================== */

async function loadFrequency() {
  const tbody = document.getElementById("freq-tbody");
  if (!tbody) return;

  try {
    const response = await fetch(`${API_URL}/dashboard/alert-frequency`);

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const rows = await response.json();

    if (!rows.length) {
      tbody.innerHTML =
        '<div class="table-row freq-row" role="row"><div role="cell" style="grid-column:1/-1;text-align:center;padding:2rem">Nenhum dado de frequência disponível</div></div>';
      document.getElementById("freq-chart").innerHTML = "";
      return;
    }

    const max = rows[0].total;

    // ── Gráfico de barras horizontais SVG ──
    renderFreqChart(rows, max);

    // ── Tabela detalhada ──
    tbody.innerHTML = rows
      .map(
        (r, i) => {
          const pct = Math.round((r.total / max) * 100);
          const barWidth = Math.max(4, pct);
          const isTop = i === 0 ? " top-location" : "";
          return `
    <div class="table-row freq-row${isTop}" role="row">
      <div role="cell">${escapeHtml(r.data)}</div>
      <div role="cell">${escapeHtml(r.horaPico)}</div>
      <div role="cell" class="frequency-location-cell">
        <div class="frequency-bar" style="--bar-width:${barWidth}%"></div>
        <span class="frequency-label">
          <span class="mini-pin" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="presentation">
              <path d="M12 2C8.14 2 5 5.14 5 9c0 4.83 7 13 7 13s7-8.17 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
            </svg>
          </span>
          ${escapeHtml(r.localizacao)}
        </span>
      </div>
      <div role="cell">${escapeHtml(r.dia)}</div>
      <div role="cell">
        <span class="freq-badge">${r.total}x</span>
      </div>
    </div>`;
        }
      )
      .join("");

    console.log("Frequência atualizada:", rows.length, "grupos");
  } catch (error) {
    console.error("Erro ao carregar frequência:", error);
  }
}

// Desenha o gráfico de barras SVG
function renderFreqChart(rows, max) {
  const wrapper = document.getElementById("freq-chart");
  if (!wrapper) return;

  // Mostra no máximo 8 barras
  const items = rows.slice(0, 8).reverse();

  const chartW = 720;
  const chartH = 300;
  const padLeft = 220;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const areaW = chartW - padLeft - padRight;
  const barH = 26;
  const gap = 8;
  const totalH = items.length * (barH + gap);

  const colors = [
    "url(#barGrad1)", "url(#barGrad2)", "url(#barGrad3)", "url(#barGrad4)",
    "url(#barGrad5)", "url(#barGrad6)", "url(#barGrad7)", "url(#barGrad8)",
  ];

  // Gera os gradientes
  const defs = `
    <defs>
      <linearGradient id="barGrad1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#d06a82"/><stop offset="100%" stop-color="#e89db0"/>
      </linearGradient>
      <linearGradient id="barGrad2" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#c9627b"/><stop offset="100%" stop-color="#e293a8"/>
      </linearGradient>
      <linearGradient id="barGrad3" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#c45a74"/><stop offset="100%" stop-color="#dc8aa0"/>
      </linearGradient>
      <linearGradient id="barGrad4" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#bd5170"/><stop offset="100%" stop-color="#d58098"/>
      </linearGradient>
      <linearGradient id="barGrad5" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#e38fa6"/><stop offset="100%" stop-color="#f0bbc8"/>
      </linearGradient>
      <linearGradient id="barGrad6" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#e08ca3"/><stop offset="100%" stop-color="#eeB5c4"/>
      </linearGradient>
      <linearGradient id="barGrad7" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#de889f"/><stop offset="100%" stop-color="#ecb0c0"/>
      </linearGradient>
      <linearGradient id="barGrad8" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#dc849b"/><stop offset="100%" stop-color="#eaaabc"/>
      </linearGradient>
      <filter id="barShadow">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#b04a60" flood-opacity="0.2"/>
      </filter>
    </defs>`;

  // Linhas de grade
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const x = padLeft + frac * areaW;
    const v = Math.round(frac * max);
    return `
      <line x1="${x}" y1="${padTop}" x2="${x}" y2="${chartH - padBottom}" stroke="rgba(181,130,138,0.15)" stroke-width="1" stroke-dasharray="4 4"/>
      <text x="${x}" y="${chartH - 8}" text-anchor="middle" font-size="11" fill="#b08a94" font-family="Poppins, sans-serif">${v}</text>`;
  }).join("");

  // Barras — usa animação CSS barSlideIn com delay inline
  const bars = items.map((r, i) => {
    const y = padTop + i * (barH + gap) + (chartH - padBottom - totalH) / 2;
    const w = Math.max(12, (r.total / max) * areaW);
    const label = r.localizacao.length > 28 ? r.localizacao.slice(0, 26) + "…" : r.localizacao;

    return `
      <g class="freq-bar-group" style="animation-delay: ${i * 0.08}s">
        <!-- Label -->
        <text x="${padLeft - 12}" y="${y + barH / 2 + 5}" text-anchor="end" font-size="12" fill="#5a3a3f" font-family="Poppins, sans-serif" font-weight="600">${escapeHtml(label)}</text>
        <!-- Barra -->
        <rect x="${padLeft}" y="${y}" width="${w}" height="${barH}" rx="8" fill="${colors[i]}" filter="url(#barShadow)">
          <animate attributeName="width" from="0" to="${w}" dur="0.6s" begin="${i * 0.08}s" fill="freeze"/>
        </rect>
        <!-- Contador -->
        <text x="${padLeft + w + 8}" y="${y + barH / 2 + 5}" font-size="13" fill="#b84a62" font-family="Poppins, sans-serif" font-weight="700">${r.total}x</text>
      </g>`;
  }).join("");

  // Monta o SVG completo e substitui o conteúdo do wrapper
  const svgHTML = `<svg class="freq-chart-svg" viewBox="0 0 ${chartW} ${chartH}" aria-label="Gráfico de acionamentos por local" role="img">
    ${defs}
    ${gridLines}
    ${bars}
    ${items.length > 0 ? `<text x="${chartW - 20}" y="22" text-anchor="end" font-size="10" fill="#b08a94" font-family="Poppins, sans-serif" font-weight="500">${escapeHtml(items[items.length - 1].dia)}</text>` : ""}
  </svg>`;

  wrapper.innerHTML = svgHTML;
}

loadFrequency();

/* ==========================================================================
   Polling — atualização periódica (escalonada para evitar rajadas)
   ========================================================================== */

// Dashboard stats a cada 30s
setInterval(loadDashboard, 30_000);

// Alertas + Pipeline a cada 30s (inicia com 7s de defasagem)
setTimeout(() => {
  setInterval(loadAlertsAndPipeline, 30_000);
  // Primeira chamada imediata já foi feita no bootstrap acima,
  // mas a cada 30s a partir de agora
}, 7_000);

// Frequência a cada 30s (inicia com 15s de defasagem)
setTimeout(() => {
  setInterval(loadFrequency, 30_000);
}, 15_000);
