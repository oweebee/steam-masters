import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Setup : accessible seulement si pas d'admin en DB (géré côté page)
  if (pathname.startsWith("/setup")) return NextResponse.next();

  // Routes admin
  if (pathname.startsWith("/admin")) {
    if (!session) return NextResponse.redirect(new URL("/login", req.url));
    if ((session.user as any)?.role !== "ADMIN")
      return NextResponse.redirect(new URL("/", req.url));
  }

  // Routes protégées (collection, duels, etc.)
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/collection")) {
    if (!session) return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/collection/:path*", "/setup/:path*"],
};
