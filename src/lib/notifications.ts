import { prisma } from "@/lib/prisma";

export type NotifType = "MESSAGE" | "BATTLE" | "TRADE" | "AUCTION" | "SYSTEM" | "BUG";

export async function createNotification(
  userId: string,
  type: NotifType,
  title: string,
  body: string,
  link?: string
) {
  try {
    await prisma.notification.create({ data: { userId, type, title, body, link } });
  } catch {
    // best-effort — never block the main flow
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}
