"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { ...form, redirect: false });
    if (res?.error) {
      setError("Email/mot de passe invalide ou compte non approuvé.");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6">Connexion</h1>
        {params.get("setup") === "done" && (
          <p className="text-green-400 text-sm mb-4">Compte admin créé. Connectez-vous.</p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <input required type="text" placeholder="Email ou pseudo" value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
          <input required type="password" placeholder="Mot de passe" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-3 transition disabled:opacity-50">
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="text-gray-500 text-sm mt-4 text-center">
          Pas de compte ? <Link href="/signup" className="text-blue-400 hover:underline">S&apos;inscrire</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
