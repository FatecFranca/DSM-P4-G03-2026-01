const API_URL = "http://localhost:3000";

async function loadDashboard() {
  try {
    const response = await fetch(`${API_URL}/dashboard/stats`);

    const data = await response.json();

    document.getElementById("users").innerText = data.users;
    document.getElementById("alerts").innerText = data.alerts;
    document.getElementById("devices").innerText = data.devices;

    console.log("Dashboard atualizado:", data);
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
  }
}

loadDashboard();

setInterval(loadDashboard, 5000);