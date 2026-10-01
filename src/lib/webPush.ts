import webPush from "web-push";
import { prisma } from "@/lib/prisma";

export type PushNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
};

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendPushNotifications(notifications: PushNotificationInput[]) {
  if (notifications.length === 0 || !configureWebPush()) return;
  const userIds = [...new Set(notifications.map((notification) => notification.userId))];
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const byUser = new Map<string, PushNotificationInput[]>();
  for (const notification of notifications) {
    const entries = byUser.get(notification.userId) ?? [];
    entries.push(notification);
    byUser.set(notification.userId, entries);
  }

  const expiredEndpoints = new Set<string>();
  await Promise.all(subscriptions.flatMap((subscription) =>
    (byUser.get(subscription.userId) ?? []).map(async (notification) => {
      try {
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({
          title: notification.title,
          body: notification.body,
          link: notification.link ?? "/alertes",
          type: notification.type,
        }));
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) expiredEndpoints.add(subscription.endpoint);
      }
    }),
  ));
  if (expiredEndpoints.size > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: [...expiredEndpoints] } } });
  }
}

export async function dispatchPushNotifications(notifications: PushNotificationInput[]) {
  try {
    await sendPushNotifications(notifications);
  } catch {
    // Best-effort : une panne Push ne doit jamais bloquer l'action principale.
  }
}
