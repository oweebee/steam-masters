import { AppShell } from "@/components/AppShell";
import { MessagesClient } from "./MessagesClient";

export default function Page() {
  return (
    <AppShell>
      <MessagesClient />
    </AppShell>
  );
}
