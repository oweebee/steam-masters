import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AppLogLevel = "INFO" | "SUCCESS" | "WARNING" | "ERROR";
export type AppLogCategory = "IMPORT" | "SYNC" | "REPAIR" | "DISCOVERY" | "IMAGE" | "APP";

type AppLogInput = {
  runId?: string | null;
  category: AppLogCategory;
  level?: AppLogLevel;
  message: string;
  details?: Prisma.InputJsonValue;
};

// Un problème d'écriture du journal ne doit jamais interrompre l'opération métier.
export async function writeAppLog({ runId, category, level = "INFO", message, details }: AppLogInput) {
  try {
    await prisma.appLog.create({
      data: {
        runId: runId?.slice(0, 100) || null,
        category,
        level,
        message: message.slice(0, 1000),
        details,
      },
    });
    await prisma.appLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
  } catch (error) {
    console.error("[APP_LOG_WRITE_FAILED]", error);
  }
}
