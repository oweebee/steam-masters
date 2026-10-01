import { redirect } from "next/navigation";

// Page "Amis" remplacée par "Joueurs" (liste publique, pas de système de demande).
export default function Page() {
  redirect("/joueurs");
}
