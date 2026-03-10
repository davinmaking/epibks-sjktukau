"use client";

import { AuthProvider } from "@/components/auth-provider";
import { NavSidebar } from "@/components/nav-sidebar";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <NavSidebar role="teacher" />
      {/* Mobile: offset for top bar; Desktop: offset for sidebar */}
      <main className="min-h-screen pt-14 md:pl-60 md:pt-0">
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </AuthProvider>
  );
}
