export type ShopNotificationSubject = {
  offerId: string;
  subjectKey: string;
  name: string;
  price: number;
};

export type ShopWatcher = {
  userId: string;
  gameId: string | null;
  studioId: string | null;
};

export function buildShopWatchNotifications(subjects: ShopNotificationSubject[], watchers: ShopWatcher[]) {
  const subjectByKey = new Map(subjects.map((subject) => [subject.subjectKey, subject]));
  return watchers.flatMap((watcher) => {
    const subjectKey = watcher.gameId ? `GAME:${watcher.gameId}` : watcher.studioId ? `STUDIO:${watcher.studioId}` : null;
    const subject = subjectKey ? subjectByKey.get(subjectKey) : null;
    if (!subject) return [];
    return [{
      userId: watcher.userId,
      type: "SHOP",
      title: `🛒 « ${subject.name} » est disponible au magasin`,
      body: `Une carte que tu suis est proposée à ${subject.price.toLocaleString("fr-FR")} gigapuissances jusqu’à la prochaine rotation.`,
      link: `/offre-magasin/${encodeURIComponent(subject.offerId)}`,
    }];
  });
}
