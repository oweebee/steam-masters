import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await auth()) redirect("/dashboard");
  return <Suspense><LoginForm /></Suspense>;
}
