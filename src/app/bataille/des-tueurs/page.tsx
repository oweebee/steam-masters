import { AppShell } from "@/components/AppShell";
import { BattleModeNav } from "../BattleModeNav";
import { DiceKillerClient } from "./DiceKillerClient";

export default function Page() {
  return <AppShell><BattleModeNav active="dice" /><DiceKillerClient /></AppShell>;
}
