import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AlertesClient } from "./AlertesClient";

export const metadata = { title: "Alertes — Steam Masters" };

export default async function AlertesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, title: true, body: true, link: true, read: true, createdAt: true },
  });

  return <AlertesClient notifications={notifications} />;
}
