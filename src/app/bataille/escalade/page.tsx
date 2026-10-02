import { AppShell } from "@/components/AppShell";
import { BattleModeNav } from "../BattleModeNav";
import { EscaladeClient } from "../EscaladeClient";

export default function Page() {
  return <AppShell><BattleModeNav active="escalade" /><EscaladeClient /></AppShell>;
}
