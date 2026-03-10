"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error("登录失败", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    // Fetch teacher record to determine role
    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .select("role")
      .single();

    if (teacherError || !teacher) {
      toast.error("无法获取教师信息", {
        description: "请联系管理员",
      });
      setLoading(false);
      return;
    }

    if (teacher.role === "admin") {
      router.push("/dashboard");
    } else {
      router.push("/my-class");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold">SJKC Tukau</CardTitle>
          <CardDescription className="text-base font-medium text-foreground/80">
            家长出席系统
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">电子邮件</Label>
              <Input
                id="email"
                type="email"
                placeholder="teacher@sjkctukau.edu.my"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
