import { AppShell } from "@/components/AppShell";
import { PackClient } from "./PackClient";

export default function DashboardPage() {
  return (
    <AppShell>
      <PackClient />
    </AppShell>
  );
}
