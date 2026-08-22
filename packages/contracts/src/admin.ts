import { z } from "zod";

import { UuidSchema } from "./common.js";

export const DashboardDailyActivationSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
});

export type DashboardDailyActivation = z.infer<
  typeof DashboardDailyActivationSchema
>;

export const DashboardFrequentLocationSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});

export type DashboardFrequentLocation = z.infer<
  typeof DashboardFrequentLocationSchema
>;

export const DashboardFrequentPlaceSchema = z.object({
  label: z.string(),
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});

export type DashboardFrequentPlace = z.infer<
  typeof DashboardFrequentPlaceSchema
>;

export const DashboardRecentAlertSchema = z.object({
  id: UuidSchema,
  date: z.string(),
  time: z.string(),
  locationLabel: z.string(),
  lat: z.number(),
  lng: z.number(),
  arrivalTimeSeconds: z.number().nullable(),
  status: z.enum(["active", "closed"]),
});

export type DashboardRecentAlert = z.infer<typeof DashboardRecentAlertSchema>;

export const DashboardResponseSchema = z.object({
  totalActivations: z.number().int().nonnegative(),
  uniqueLocations: z.number().int().nonnegative(),
  averageArrivalTimeSeconds: z.number().nullable(),
  activeAlertsCount: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
  dailyActivations: z.array(DashboardDailyActivationSchema),
  frequentLocations: z.array(DashboardFrequentLocationSchema),
  frequentNeighborhoods: z.array(DashboardFrequentPlaceSchema),
  recentAlerts: z.array(DashboardRecentAlertSchema),
});

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
