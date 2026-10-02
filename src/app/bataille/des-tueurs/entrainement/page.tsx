import { AppShell } from "@/components/AppShell";
import { BattleModeNav } from "../../BattleModeNav";
import { DiceKillerTraining } from "./DiceKillerTraining";

export default function Page() {
  return <AppShell><BattleModeNav active="dice" /><DiceKillerTraining /></AppShell>;
}
