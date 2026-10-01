"use client";
import { useEffect, useState } from "react";

type User = { id: string; username: string; email: string; role: string; status: string; createdAt: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReg, setOpenReg] = useState(false);
  const [openRegLoading, setOpenRegLoading] = useState(true);
  const [openRegSaving, setOpenRegSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
    setLoading(false);
  }

  async function loadOpenReg() {
    const res = await fetch("/api/admin/settings?keys=OPEN_REGISTRATION");
    const data = await res.json();
    setOpenReg(data.OPEN_REGISTRATION === "true");
    setOpenRegLoading(false);
  }

  async function toggleOpenReg() {
    const next = !openReg;
    setOpenReg(next);
    setOpenRegSaving(true);
    try {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ OPEN_REGISTRATION: String(next) }),
      });
    } finally { setOpenRegSaving(false); }
  }

  async function patch(id: string, data: Partial<{ status: string; role: string }>) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    load();
  }

  useEffect(() => { load(); loadOpenReg(); }, []);

  const statusBadge: Record<string, string> = {
    PENDING:  "bg-yellow-500/20 text-yellow-400",
    ACTIVE:   "bg-green-500/20 text-green-400",
    REJECTED: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="flex items-center gap-4 mb-8">
        <a href="/admin" className="text-gray-400 hover:text-white">← Admin</a>
        <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
      </div>
      <div className="max-w-4xl mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-white font-medium">Inscription directe (sans approbation admin)</div>
          <p className="text-gray-500 text-xs mt-0.5">Si activé, les nouveaux comptes sont immédiatement <strong>ACTIVE</strong> au lieu de <strong>PENDING</strong>. Enregistré immédiatement.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={openReg}
          disabled={openRegLoading || openRegSaving}
          onClick={toggleOpenReg}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${openReg ? "bg-amber-500" : "bg-gray-700"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${openReg ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      {loading ? <p className="text-gray-400">Chargement…</p> : (
        <div className="space-y-3 max-w-4xl">
          {users.map((u) => (
            <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">{u.username}</div>
                <div className="text-gray-400 text-sm">{u.email}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge[u.status]}`}>{u.status}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300">{u.role}</span>
              <div className="flex gap-2 flex-wrap">
                {u.status === "PENDING" && (
                  <>
                    <button onClick={() => patch(u.id, { status: "ACTIVE" })}
                      className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition">Approuver</button>
                    <button onClick={() => patch(u.id, { status: "REJECTED" })}
                      className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition">Rejeter</button>
                  </>
                )}
                {u.status === "REJECTED" && (
                  <button onClick={() => patch(u.id, { status: "ACTIVE" })}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition">Réactiver</button>
                )}
                {u.role === "USER" && u.status === "ACTIVE" && (
                  <button onClick={() => patch(u.id, { role: "ADMIN" })}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition">→ Admin</button>
                )}
                {u.role === "ADMIN" && (
                  <button onClick={() => patch(u.id, { role: "USER" })}
                    className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded-lg transition">Retirer admin</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
