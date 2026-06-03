import { DashboardResponseSchema } from "@protecther/contracts";
import { count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  alertAcknowledgments,
  alertLocations,
  alerts,
  users,
} from "../db/schema.js";

const RECENT_ALERTS_LIMIT = 20;
const DAILY_ACTIVATIONS_DAYS = 30;
const FREQUENT_LOCATIONS_LIMIT = 4;

/**
 * Reverse geocode using Nominatim (OpenStreetMap).
 * Includes caching so repeated coordinate lookups don't hit the API again.
 */
const geocodeCache = new Map<string, string | null>();

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key) ?? null;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lng.toString());
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "pt-BR");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "ProtectHer-API/1.0" },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }

    const data = (await res.json()) as { display_name?: string };
    const displayName = data?.display_name;
    if (!displayName) {
      geocodeCache.set(key, null);
      return null;
    }

    // Build clean address: street, number, neighborhood, city, state
    const parts = displayName.split(",").map((s) => s.trim());
    const relevant: string[] = [];
    for (const part of parts) {
      if (/^\d{5}-\d{3}$/.test(part)) continue;
      if (part === "Brasil") continue;
      if (/^Região\s/.test(part)) continue;
      relevant.push(part);
    }
    const address = relevant.slice(0, 4).join(", ");
    geocodeCache.set(key, address || displayName);
    return address || displayName;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear().toString();
  return `${d}/${m}/${y}`;
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${min}`;
}

/** Postgres EXTRACT/EPOCH via raw SQL often returns numeric as string. */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/dashboard", async (_request, reply) => {
    try {
      // 1. Total activations
      const [totalRow] = await db
        .select({ value: count() })
        .from(alerts);
      const totalActivations = totalRow?.value ?? 0;

      // 2. Unique locations
      const [locRow] = await db
        .select({ value: count() })
        .from(alertLocations);
      const uniqueLocations = locRow?.value ?? 0;

      // 3. Average arrival time
      const [avgRow] = await db.execute<{ avg_seconds: number | null }>(
        sql`SELECT AVG(EXTRACT(EPOCH FROM (aa.acknowledged_at - a.started_at))) AS avg_seconds
            FROM ${alertAcknowledgments} aa
            INNER JOIN (
              SELECT alert_id, MIN(acknowledged_at) AS first_ack
              FROM ${alertAcknowledgments}
              GROUP BY alert_id
            ) first_ack
              ON aa.alert_id = first_ack.alert_id
             AND aa.acknowledged_at = first_ack.first_ack
            INNER JOIN ${alerts} a ON a.id = aa.alert_id`,
      );
      const averageArrivalTimeSeconds = toNumberOrNull(avgRow?.avg_seconds);

      // 4. Active alerts count
      const [activeRow] = await db
        .select({ value: count() })
        .from(alerts)
        .where(eq(alerts.status, "active"));
      const activeAlertsCount = activeRow?.value ?? 0;

      // 5. Total users
      const [usersRow] = await db
        .select({ value: count() })
        .from(users);
      const totalUsers = usersRow?.value ?? 0;

      // 6. Daily activations
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - DAILY_ACTIVATIONS_DAYS);

      const dailyRows = await db.execute<{ day: string; count: number }>(
        sql`SELECT DATE(a.started_at) AS day, COUNT(*)::int AS count
            FROM ${alerts} a
            WHERE a.started_at >= ${sinceDate.toISOString()}
            GROUP BY DATE(a.started_at)
            ORDER BY day ASC`,
      );

      const dailyMap = new Map<string, number>();
      for (let i = 0; i < DAILY_ACTIVATIONS_DAYS; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyMap.set(key, 0);
      }
      for (const row of dailyRows) {
        dailyMap.set(row.day, row.count);
      }
      const dailyActivations = Array.from(dailyMap.entries())
        .map(([date, cnt]) => ({ date, count: cnt }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 7. Frequent locations
      const freqRows = await db.execute<{
        lat: number;
        lng: number;
        count: number;
      }>(
        sql`SELECT ROUND(al.lat::numeric, 3) AS lat,
                   ROUND(al.lng::numeric, 3) AS lng,
                   COUNT(*)::int AS count
            FROM ${alertLocations} al
            GROUP BY ROUND(al.lat::numeric, 3), ROUND(al.lng::numeric, 3)
            ORDER BY count DESC
            LIMIT ${FREQUENT_LOCATIONS_LIMIT}`,
      );

      const locationLabels = [
        "Região Centro",
        "Região Norte",
        "Região Sul",
        "Região Leste",
      ];
      const totalFreq = freqRows.reduce((sum, r) => sum + r.count, 0);
      const frequentLocations = freqRows.map((row, i) => ({
        label: locationLabels[i] ?? `Região ${i + 1}`,
        lat: Number(row.lat),
        lng: Number(row.lng),
        count: row.count,
        percentage:
          totalFreq > 0
            ? Math.round((row.count / totalFreq) * 10000) / 100
            : 0,
      }));

      // 8. Recent alerts with location, timing, AND reverse geocoded address
      const recentRows = await db.execute<{
        id: string;
        status: string;
        started_at: string;
        lat: number;
        lng: number;
        arrival_seconds: number | null;
      }>(
        sql`SELECT a.id,
                   a.status,
                   a.started_at,
                   COALESCE(al.lat, 0)  AS lat,
                   COALESCE(al.lng, 0)  AS lng,
                   (SELECT EXTRACT(EPOCH FROM (MIN(aa.acknowledged_at) - a.started_at))
                    FROM ${alertAcknowledgments} aa
                    WHERE aa.alert_id = a.id) AS arrival_seconds
            FROM ${alerts} a
            LEFT JOIN LATERAL (
              SELECT al2.lat, al2.lng
              FROM ${alertLocations} al2
              WHERE al2.alert_id = a.id
              ORDER BY al2.captured_at ASC
              LIMIT 1
            ) al ON true
            ORDER BY a.started_at DESC
            LIMIT ${RECENT_ALERTS_LIMIT}`,
      );

      // Resolve street names via reverse geocoding (parallel, with cache)
      const recentAlerts = recentRows.map((row) => {
        const startedAt = new Date(row.started_at);
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        return { row, startedAt, lat, lng };
      });

      // Geocode all in parallel (cached entries return instantly)
      const addresses = await Promise.all(
        recentAlerts.map((a) =>
          a.lat === 0 && a.lng === 0
            ? Promise.resolve("Sem localização")
            : reverseGeocode(a.lat, a.lng),
        ),
      );

      const recentAlertsOut = recentAlerts.map((a, i) => {
        const locationLabel =
          addresses[i] ?? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`;
        return {
          id: a.row.id,
          date: formatDate(a.startedAt),
          time: formatTime(a.startedAt),
          locationLabel,
          lat: a.lat,
          lng: a.lng,
          arrivalTimeSeconds: toNumberOrNull(a.row.arrival_seconds),
          status: a.row.status as "active" | "closed",
        };
      });

      const body = DashboardResponseSchema.parse({
        totalActivations,
        uniqueLocations,
        averageArrivalTimeSeconds,
        activeAlertsCount,
        totalUsers,
        dailyActivations,
        frequentLocations,
        recentAlerts: recentAlertsOut,
      });

      return reply.send(body);
    } catch (error) {
      _request.log.error({ err: error }, "dashboard_fetch_failed");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not load dashboard data",
        },
      });
    }
  });
}
