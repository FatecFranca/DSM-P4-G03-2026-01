// Usa a mesma origem da página — funciona local e em produção
const API_URL = window.location.origin;

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
      if (el) {
        el.innerText = data[card.id] ?? card.fallback;
      }
    }

    console.log("Dashboard atualizado:", data);
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);

    // Sinaliza visualmente que a API está indisponível
    for (const card of cards) {
      const el = document.getElementById(card.id);
      if (el && el.innerText === card.fallback) {
        el.innerText = "—";
      }
    }
  }
}

loadDashboard();

// Atualiza a cada 30 segundos (evita polling agressivo)
setInterval(loadDashboard, 30_000);
