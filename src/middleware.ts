import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Setup : accessible seulement si pas d'admin en DB (géré côté page)
  if (pathname.startsWith("/setup")) return NextResponse.next();

  // Routes admin
  if (pathname.startsWith("/admin") || pathname.startsWith("/toutes-les-cartes")) {
    if (!session) return NextResponse.redirect(new URL("/login", req.url));
    if ((session.user as { role?: string })?.role !== "ADMIN")
      return NextResponse.redirect(new URL("/", req.url));
  }

  // Routes protégées (collection, duels, etc.)
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/collection") || pathname.startsWith("/bataille")) {
    if (!session) return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/toutes-les-cartes/:path*", "/dashboard/:path*", "/collection/:path*", "/bataille/:path*", "/setup/:path*"],
};
