import { prisma } from "@/lib/prisma";
import { dispatchPushNotifications, type PushNotificationInput } from "@/lib/webPush";

export type NotifType = "MESSAGE" | "BATTLE" | "TRADE" | "AUCTION" | "SHOP" | "SYSTEM" | "BUG";

export async function createNotification(
  userId: string,
  type: NotifType,
  title: string,
  body: string,
  link?: string
) {
  try {
    const notification = { userId, type, title, body, link };
    await prisma.notification.create({ data: notification });
    await dispatchPushNotifications([notification]);
  } catch {
    // best-effort — never block the main flow
  }
}

export async function createNotifications(notifications: PushNotificationInput[]) {
  if (notifications.length === 0) return;
  await prisma.notification.createMany({ data: notifications });
  await dispatchPushNotifications(notifications);
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}
