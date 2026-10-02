import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

// Notifications de combat, best-effort, envoyées APRÈS la transaction.
// "turn" : une seule notification "À toi de jouer" non lue à la fois par joueur
// (évite ~12 notifications par combat).
export async function notifyBattle(items: { userId: string; title: string; body: string; turn?: boolean; href?: string }[]) {
  for (const item of items) {
    try {
      if (item.turn) {
        const unread = await prisma.notification.count({ where: { userId: item.userId, type: "BATTLE", read: false, title: item.title } });
        if (unread) continue;
      }
      await createNotification(item.userId, "BATTLE", item.title, item.body, item.href ?? "/bataille/escalade");
    } catch {
      // best-effort
    }
  }
}
