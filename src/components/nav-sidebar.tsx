"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  BarChart3,
  Users,
  UserCog,
  School,
  ClipboardCheck,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const adminLinks: NavItem[] = [
  { href: "/dashboard", label: "仪表板", icon: LayoutDashboard },
  { href: "/events", label: "活动", icon: Calendar },
  { href: "/reports", label: "报告", icon: BarChart3 },
  { href: "/students", label: "学生", icon: Users },
  { href: "/users", label: "用户管理", icon: UserCog },
];

const teacherLinks: NavItem[] = [
  { href: "/home", label: "仪表盘", icon: LayoutDashboard },
  { href: "/attendance", label: "出席记录", icon: ClipboardCheck },
  { href: "/my-class", label: "我的班级", icon: School },
];

interface NavSidebarProps {
  role: "admin" | "teacher";
}

function NavLinks({
  links,
  pathname,
  onNavigate,
}: {
  links: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {links.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavSidebar({ role }: NavSidebarProps) {
  const pathname = usePathname();
  const { teacher, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const links = role === "admin" ? adminLinks : teacherLinks;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4">
        <h2 className="text-lg font-semibold">SJKC Tukau</h2>
        <p className="text-xs text-muted-foreground">家长出席系统</p>
      </div>

      <Separator />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks
          links={links}
          pathname={pathname}
          onNavigate={() => setOpen(false)}
        />
      </div>

      <Separator />

      {/* User info + Logout */}
      <div className="p-4">
        <div className="mb-3">
          <p className="text-sm font-medium">{teacher?.name ?? "..."}</p>
          <p className="text-xs text-muted-foreground">
            {role === "admin" ? "管理员" : "教师"}
            {teacher?.class_name ? ` - ${teacher.class_name}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="size-4" />
          退出登录
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: hamburger button + sheet drawer */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b bg-background px-4 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" />}
          >
            <Menu className="size-5" />
            <span className="sr-only">打开菜单</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(16rem,85vw)] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>导航菜单</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
        <span className="ml-3 text-sm font-semibold">SJKC Tukau</span>
      </div>

      {/* Desktop: fixed sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:border-r md:bg-background">
        {sidebarContent}
      </aside>
    </>
  );
}
