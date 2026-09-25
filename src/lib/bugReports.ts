import { z } from "zod";
export const reportStatus = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]);
export const newReport = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  pagePath: z.string().trim().max(255).refine((value) => !value || /^\/(?!\/)[^?#\r\n]*$/.test(value), "Indique un chemin de page sans paramètre (ex. /collection).").optional(),
});
export const reportUpdate = z.object({
  id: z.string().min(1).max(100),
  updatedAt: z.string().datetime(),
  status: reportStatus,
  adminNote: z.string().trim().max(5000),
  adminReply: z.string().trim().max(5000),
});
export const publicReportSelect = { id: true, title: true, description: true, pagePath: true, status: true, adminReply: true, createdAt: true, updatedAt: true } as const;
