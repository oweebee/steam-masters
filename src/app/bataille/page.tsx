import { AppShell } from "@/components/AppShell";
import { EscaladeClient } from "./EscaladeClient";
import { BattleModeNav } from "./BattleModeNav";

export default function Page() {
  return (
    <AppShell>
      <BattleModeNav active="escalade" />
      <EscaladeClient />
    </AppShell>
  );
}
