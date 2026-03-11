"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { NavSidebar } from "@/components/nav-sidebar";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, teacher, isAdmin } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (teacher) {
      if (!isAdmin) {
        router.push("/my-class");
      } else {
        setChecked(true);
      }
    } else if (user) {
      // User exists but no teacher record — redirect to teacher home
      // (avoids redirect loop with middleware which redirects /login → /dashboard)
      router.push("/home");
    }
    // If neither user nor teacher, AuthProvider already handles redirect to /login
  }, [user, teacher, isAdmin, router]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <NavSidebar role="admin" />
      {/* Mobile: offset for top bar; Desktop: offset for sidebar */}
      <main className="min-h-screen pt-14 md:pl-60 md:pt-0">
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminGuard>{children}</AdminGuard>
    </AuthProvider>
  );
}
