import type { FastifyInstance } from "fastify";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { alerts, alertLocations, bleDevices, users } from "../db/schema.js";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/stats", async () => {
    const [usersCount, alertsCount, devicesCount] = await Promise.all([
      db.$count(users),
      db.$count(alerts),
      db.$count(bleDevices),
    ]);

    return {
      users: usersCount,
      alerts: alertsCount,
      devices: devicesCount,
    };
  });

  app.get("/dashboard/recent-alerts", async () => {
    const recentAlerts = await db
      .select({
        id: alerts.id,
        status: alerts.status,
        mode: alerts.mode,
        riskLevel: alerts.riskLevel,
        startedAt: alerts.startedAt,
        userName: users.name,
      })
      .from(alerts)
      .innerJoin(users, eq(alerts.ownerUserId, users.id))
      .orderBy(desc(alerts.startedAt))
      .limit(20);

    if (recentAlerts.length === 0) {
      return [];
    }

    const alertIds = recentAlerts.map((a) => a.id);

    const allLocations = await db
      .select({
        alertId: alertLocations.alertId,
        label: alertLocations.label,
        lat: alertLocations.lat,
        lng: alertLocations.lng,
        capturedAt: alertLocations.capturedAt,
      })
      .from(alertLocations);

    // Agrupa a primeira localização (mais antiga) por alertId
    const firstLocByAlert: Record<
      string,
      { label: string | null; lat: number; lng: number; capturedAt: Date }
    > = {};

    for (const loc of allLocations) {
      if (!alertIds.includes(loc.alertId)) continue;
      const existing = firstLocByAlert[loc.alertId];
      const locTime = new Date(loc.capturedAt).getTime();
      if (!existing || locTime < existing.capturedAt.getTime()) {
        firstLocByAlert[loc.alertId] = {
          label: loc.label ?? null,
          lat: loc.lat,
          lng: loc.lng,
          capturedAt: new Date(loc.capturedAt),
        };
      }
    }

    return recentAlerts.map((alert) => {
      const firstLoc = firstLocByAlert[alert.id];
      const startedAt = new Date(alert.startedAt);

      const dateStr = startedAt.toLocaleDateString("pt-BR");
      const timeStr = startedAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      let tempoChegada = "—";
      if (firstLoc) {
        const diffSeconds = Math.round(
          (firstLoc.capturedAt.getTime() - startedAt.getTime()) / 1000,
        );
        if (diffSeconds < 60) {
          tempoChegada = `${diffSeconds} seg`;
        } else {
          const min = Math.floor(diffSeconds / 60);
          const sec = diffSeconds % 60;
          tempoChegada = `${min} min ${sec} seg`;
        }
      }

      const localizacao = firstLoc?.label ?? "—";

      return {
        data: dateStr,
        hora: timeStr,
        localizacao,
        lat: firstLoc?.lat ?? null,
        lng: firstLoc?.lng ?? null,
        tempoChegada,
        usuario: alert.userName,
        modo: alert.mode,
        risco: alert.riskLevel,
      };
    });
  });

  app.get("/dashboard/alert-frequency", async () => {
    // Busca todos os alertas com sua primeira localização
    const allAlerts = await db
      .select({
        id: alerts.id,
        startedAt: alerts.startedAt,
      })
      .from(alerts)
      .orderBy(desc(alerts.startedAt));

    if (allAlerts.length === 0) {
      return [];
    }

    const alertIds = allAlerts.map((a) => a.id);

    const allLocations = await db
      .select({
        alertId: alertLocations.alertId,
        label: alertLocations.label,
        capturedAt: alertLocations.capturedAt,
      })
      .from(alertLocations);

    // Agrupa primeira localização por alerta
    const firstLocByAlert: Record<
      string,
      { label: string | null; capturedAt: Date }
    > = {};

    for (const loc of allLocations) {
      if (!alertIds.includes(loc.alertId)) continue;
      const existing = firstLocByAlert[loc.alertId];
      const locTime = new Date(loc.capturedAt).getTime();
      if (!existing || locTime < existing.capturedAt.getTime()) {
        firstLocByAlert[loc.alertId] = {
          label: loc.label ?? null,
          capturedAt: new Date(loc.capturedAt),
        };
      }
    }

    // Agrega por localização + data
    const freqMap: Record<
      string,
      {
        localizacao: string;
        data: string;
        dia: string;
        horas: string[];
        total: number;
        startedAtIso: string;
      }
    > = {};

    const DIAS_SEMANA = [
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
    ];

    for (const alert of allAlerts) {
      const loc = firstLocByAlert[alert.id];
      const localizacao = loc?.label ?? "Local não identificado";
      const startedAt = new Date(alert.startedAt);
      const dataStr = startedAt.toLocaleDateString("pt-BR");
      const diaSemana = DIAS_SEMANA[startedAt.getDay()];
      const horaStr = startedAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const key = `${localizacao}|${dataStr}`;

      if (!freqMap[key]) {
        freqMap[key] = {
          localizacao,
          data: dataStr,
          dia: diaSemana,
          horas: [],
          total: 0,
          startedAtIso: alert.startedAt.toISOString(),
        };
      }

      freqMap[key].horas.push(horaStr);
      freqMap[key].total++;

      // Mantém a data mais recente como referência
      if (
        new Date(alert.startedAt).getTime() >
        new Date(freqMap[key].startedAtIso).getTime()
      ) {
        freqMap[key].startedAtIso = alert.startedAt.toISOString();
      }
    }

    // Converte o mapa em array ordenado por total decrescente
    const result = Object.values(freqMap)
      .map((entry) => {
        // Hora de pico = moda das horas
        const hourCount: Record<string, number> = {};
        for (const h of entry.horas) {
          hourCount[h] = (hourCount[h] ?? 0) + 1;
        }
        let horaPico = entry.horas[0];
        let maxCount = 0;
        for (const [h, c] of Object.entries(hourCount)) {
          if (c > maxCount) {
            maxCount = c;
            horaPico = h;
          }
        }

        return {
          localizacao: entry.localizacao,
          dia: entry.dia,
          data: entry.data,
          horaPico,
          total: entry.total,
        };
      })
      .sort((a, b) => b.total - a.total);

    return result;
  });
}
