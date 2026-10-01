import { AppShell } from "@/components/AppShell";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";

export default function Page() {
  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-white mb-4">Paramètres</h1>
      <PushNotificationSettings />
    </AppShell>
  );
}
