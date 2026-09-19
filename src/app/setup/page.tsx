"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [done, setDone] = useState<boolean | null>(null);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then((d) => {
      if (d.setupDone) router.replace("/login");
      else setDone(false);
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    router.push("/login?setup=done");
  }

  if (done === null) return <div className="flex items-center justify-center h-screen text-white">Chargement…</div>;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Premier lancement</h1>
        <p className="text-gray-400 text-sm mb-6">Créez le compte administrateur. Cette page sera verrouillée ensuite.</p>
        <form onSubmit={submit} className="space-y-4">
          <input required placeholder="Username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
          <input required type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
          <input required type="password" placeholder="Mot de passe (8 car. min)" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-3 transition disabled:opacity-50">
            {loading ? "Création…" : "Créer le compte admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
