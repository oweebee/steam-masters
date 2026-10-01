"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function PushLogoutLink({ children, className, title = "Déconnexion" }: { children: ReactNode; className?: string; title?: string }) {
  const router = useRouter();
  async function logout(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
    } catch {
      // La déconnexion reste prioritaire si le nettoyage Push échoue.
    } finally {
      router.push("/api/auth/signout");
    }
  }

  return <Link href="/api/auth/signout" title={title} className={className} onClick={(event) => void logout(event)}>{children}</Link>;
}
