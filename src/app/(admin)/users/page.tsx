"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CLASS_NAMES, ROLES } from "@/lib/constants";
import type { Tables } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Pencil,
  KeyRound,
  Users,
} from "lucide-react";

type Teacher = Tables<"teachers">;

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  teacher: "教师",
};

export default function UsersPage() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "teacher",
    class_name: "",
  });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    role: "",
    class_name: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Password dialog state
  const [pwOpen, setPwOpen] = useState(false);
  const [pwTeacher, setPwTeacher] = useState<Teacher | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState("");

  // Success message
  const [successMsg, setSuccessMsg] = useState("");

  const fetchTeachers = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("teachers")
      .select("*")
      .order("name");

    if (error) {
      console.error("Failed to fetch teachers:", error);
    } else {
      setTeachers(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  // Auto-dismiss success message
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(""), 3000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // --- Add teacher ---
  function openAddDialog() {
    setAddForm({
      name: "",
      email: "",
      password: "",
      role: "teacher",
      class_name: "",
    });
    setAddError("");
    setAddOpen(true);
  }

  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password) {
      setAddError("请填写所有必填字段");
      return;
    }
    if (addForm.password.length < 6) {
      setAddError("密码至少需要6个字符");
      return;
    }

    setAddSubmitting(true);
    setAddError("");

    try {
      const res = await fetch("/api/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          email: addForm.email.trim(),
          password: addForm.password,
          role: addForm.role,
          class_name: addForm.class_name || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error || "创建失败");
        return;
      }

      setAddOpen(false);
      setSuccessMsg("教师账户创建成功");
      fetchTeachers();
    } catch {
      setAddError("网络错误，请重试");
    } finally {
      setAddSubmitting(false);
    }
  }

  // --- Edit teacher ---
  function openEditDialog(teacher: Teacher) {
    setEditTeacher(teacher);
    setEditForm({
      name: teacher.name,
      role: teacher.role,
      class_name: teacher.class_name ?? "",
    });
    setEditError("");
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editTeacher || !editForm.name.trim()) {
      setEditError("姓名不能为空");
      return;
    }

    setEditSubmitting(true);
    setEditError("");

    try {
      const res = await fetch("/api/teachers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTeacher.id,
          name: editForm.name.trim(),
          role: editForm.role,
          class_name: editForm.class_name || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error || "更新失败");
        return;
      }

      setEditOpen(false);
      setSuccessMsg("教师信息已更新");
      fetchTeachers();
    } catch {
      setEditError("网络错误，请重试");
    } finally {
      setEditSubmitting(false);
    }
  }

  // --- Reset password ---
  function openPwDialog(teacher: Teacher) {
    setPwTeacher(teacher);
    setNewPassword("");
    setPwError("");
    setPwOpen(true);
  }

  async function handleResetPassword() {
    if (!pwTeacher || !newPassword) {
      setPwError("请输入新密码");
      return;
    }
    if (newPassword.length < 6) {
      setPwError("密码至少需要6个字符");
      return;
    }

    setPwSubmitting(true);
    setPwError("");

    try {
      const res = await fetch("/api/teachers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pwTeacher.id,
          password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPwError(data.error || "重置密码失败");
        return;
      }

      setPwOpen(false);
      setSuccessMsg("密码已重置");
    } catch {
      setPwError("网络错误，请重试");
    } finally {
      setPwSubmitting(false);
    }
  }

  const isSelf = (teacherId: string) => user?.id === teacherId;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success toast */}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          {successMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="text-sm text-muted-foreground">
            共 {teachers.length} 位教师
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="size-4" data-icon="inline-start" />
          添加教师
        </Button>
      </div>

      {/* Teacher list */}
      {teachers.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Users className="size-12" />
          <p className="text-lg font-medium">暂无教师</p>
          <p className="text-sm">点击「添加教师」开始创建</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>班级</TableHead>
                <TableHead>角色</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.name}
                    {isSelf(t.id) && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (我)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.email}
                  </TableCell>
                  <TableCell>
                    {t.class_name ?? (
                      <span className="text-muted-foreground">未分配</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={t.role === "admin" ? "default" : "secondary"}
                    >
                      {ROLE_LABEL[t.role] ?? t.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditDialog(t)}
                      >
                        <Pencil className="size-3.5" />
                        <span className="sr-only">编辑</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openPwDialog(t)}
                      >
                        <KeyRound className="size-3.5" />
                        <span className="sr-only">重置密码</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Teacher Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加教师</DialogTitle>
            <DialogDescription>
              创建新的教师账户，该账户可登录系统
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">
                姓名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-name"
                placeholder="输入教师姓名"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-email">
                邮箱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-email"
                type="email"
                placeholder="输入邮箱地址"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-password">
                密码 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-password"
                type="password"
                placeholder="至少6个字符"
                value={addForm.password}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, password: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>角色</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) =>
                  setAddForm((f) => ({ ...f, role: v ?? "teacher" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>班级</Label>
              <Select
                value={addForm.class_name}
                onValueChange={(v) =>
                  setAddForm((f) => ({ ...f, class_name: v ?? "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择班级（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不分配</SelectItem>
                  {CLASS_NAMES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {addError && (
              <p className="text-sm text-destructive">{addError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleAdd} disabled={addSubmitting}>
              {addSubmitting && (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              )}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Teacher Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑教师</DialogTitle>
            <DialogDescription>
              修改教师信息（邮箱不可更改）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">姓名</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>角色</Label>
              {editTeacher && isSelf(editTeacher.id) && editTeacher.role === "admin" ? (
                <div>
                  <Input value="管理员" disabled />
                  <p className="mt-1 text-xs text-muted-foreground">
                    无法更改自己的管理员角色
                  </p>
                </div>
              ) : (
                <Select
                  value={editForm.role}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, role: v ?? "teacher" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r] ?? r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>班级</Label>
              <Select
                value={editForm.class_name}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, class_name: v ?? "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择班级（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不分配</SelectItem>
                  {CLASS_NAMES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={editSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleEdit} disabled={editSubmitting}>
              {editSubmitting && (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为 {pwTeacher?.name} 设置新密码
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">
                新密码 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-password"
                type="password"
                placeholder="至少6个字符"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            {pwError && (
              <p className="text-sm text-destructive">{pwError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPwOpen(false)}
              disabled={pwSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleResetPassword} disabled={pwSubmitting}>
              {pwSubmitting && (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              )}
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
