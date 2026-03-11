import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Helper: create a redirect that preserves refreshed auth cookies
  function redirectWithCookies(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);
    // Copy any auth cookies that were refreshed during getUser()
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    return redirectWithCookies("/login");
  }

  if (user && request.nextUrl.pathname === "/login") {
    return redirectWithCookies("/dashboard");
  }

  // Role-based route protection: non-admin users cannot access admin routes
  const adminRoutes = ["/dashboard", "/events", "/reports", "/users", "/students"];
  const isAdminRoute = adminRoutes.some((r) =>
    request.nextUrl.pathname.startsWith(r)
  );

  if (user && isAdminRoute) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("role")
      .eq("id", user.id)
      .single();

    if (teacher?.role !== "admin") {
      return redirectWithCookies("/home");
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
