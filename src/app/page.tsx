import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  if (await auth()) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 text-center">
      <Image src="/icons/icon-192.png" alt="" width={112} height={112} className="w-28 h-28 mb-5 drop-shadow-[0_0_24px_rgba(169,31,31,0.3)]" />
      <h1 className="text-5xl font-bold text-white mb-4">Steam<span className="text-red-500">Masters</span></h1>
      <p className="text-gray-400 text-lg mb-8">Collectionnez, duels, enchères — basé sur la bibliothèque Steam.</p>
      <div className="flex gap-4">
        <Link href="/signup" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition">
          S&apos;inscrire
        </Link>
        <Link href="/login" className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition">
          Se connecter
        </Link>
      </div>
    </div>
  );
}
