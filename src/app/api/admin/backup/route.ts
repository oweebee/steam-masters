import { spawn } from "node:child_process";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sauvegarde complète : pg_dump (format custom, compressé) de TOUTE la base —
// réglages (AppSetting), joueurs, cartes, decks, combats, échanges, catalogue
// et images (table StoredImage). Streamé tel quel au navigateur.
// Restauration : pg_restore --clean --if-exists --no-owner -d <DATABASE_URL> fichier.dump
export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return Response.json({ error: "DATABASE_URL absente" }, { status: 500 });

  const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--dbname=${databaseUrl}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Attend le démarrage réel du process (pg_dump absent => erreur propre, pas un fichier vide).
  const started = await new Promise<Error | null>((resolve) => {
    child.once("spawn", () => resolve(null));
    child.once("error", (error) => resolve(error));
  });
  if (started) return Response.json({ error: `pg_dump indisponible : ${started.message}` }, { status: 500 });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("close", (code) => {
    if (code !== 0) console.error(`[backup] pg_dump code ${code} : ${stderr.slice(0, 2000)}`);
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      child.stdout.on("end", () => controller.close());
      child.stdout.on("error", (error) => controller.error(error));
    },
    cancel() { child.kill("SIGTERM"); },
  });

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="steammasters-${stamp}.dump"`,
      "Cache-Control": "no-store",
    },
  });
}
