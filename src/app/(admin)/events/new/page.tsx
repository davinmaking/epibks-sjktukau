"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CLASS_NAMES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function NewEventPage() {
  const router = useRouter();
  const { teacher } = useAuth();

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [trackFamily, setTrackFamily] = useState(true);
  const [trackStudent, setTrackStudent] = useState(false);
  const [includedClasses, setIncludedClasses] = useState<Set<string>>(
    new Set(CLASS_NAMES)
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = "请输入活动名称";
    } else if (name.trim().length > 100) {
      newErrors.name = "活动名称不能超过100个字符";
    }
    if (!date) {
      newErrors.date = "请选择日期";
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(date + "T00:00:00");
      if (selected < today) {
        newErrors.date = "日期不能是过去的日期";
      }
    }
    if (!trackFamily && !trackStudent) {
      newErrors.tracking = "至少选择一种追踪模式";
    }
    if (includedClasses.size === 0) {
      newErrors.classes = "至少选择一个班级";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!teacher) return;

    setSubmitting(true);
    const supabase = createClient();

    // null means all classes included
    const classesValue =
      includedClasses.size === CLASS_NAMES.length
        ? null
        : [...includedClasses];

    const { error } = await supabase.from("events").insert({
      name: name.trim(),
      date,
      description: description.trim() || null,
      track_family: trackFamily,
      track_student: trackStudent,
      included_classes: classesValue,
      created_by: teacher.id,
    });

    if (error) {
      console.error("Failed to create event:", error);
      toast.error("创建活动失败，请重试");
      setSubmitting(false);
      return;
    }

    toast.success("活动创建成功");
    router.push("/events");
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={() => router.push("/events")}
      >
        <ArrowLeft className="size-4" data-icon="inline-start" />
        返回活动列表
      </Button>

      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>创建活动</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Event name */}
            <div className="space-y-2">
              <Label htmlFor="name">活动名称 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：2026年第一学期家长日"
                maxLength={100}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">日期 *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              {errors.date && (
                <p className="text-sm text-destructive">{errors.date}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="活动描述（可选）"
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            {/* Tracking mode */}
            <div className="space-y-3">
              <Label>追踪模式 *</Label>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={trackFamily}
                    onCheckedChange={(checked) =>
                      setTrackFamily(checked as boolean)
                    }
                  />
                  <span className="text-sm">追踪家庭出席</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={trackStudent}
                    onCheckedChange={(checked) =>
                      setTrackStudent(checked as boolean)
                    }
                  />
                  <span className="text-sm">追踪学生出席</span>
                </label>
              </div>
              {errors.tracking && (
                <p className="text-sm text-destructive">{errors.tracking}</p>
              )}
            </div>

            {/* Included classes */}
            <div className="space-y-3">
              <Label>参与班级 *</Label>
              <p className="text-xs text-muted-foreground">
                选择需要计入此活动出席率的班级
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIncludedClasses(new Set(CLASS_NAMES))}
                  disabled={includedClasses.size === CLASS_NAMES.length}
                >
                  全选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIncludedClasses(new Set())}
                  disabled={includedClasses.size === 0}
                >
                  取消全选
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CLASS_NAMES.map((cls) => (
                  <label
                    key={cls}
                    className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      includedClasses.has(cls)
                        ? "border-primary/30 bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={includedClasses.has(cls)}
                      onCheckedChange={(checked) => {
                        setIncludedClasses((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.add(cls);
                          } else {
                            next.delete(cls);
                          }
                          return next;
                        });
                      }}
                    />
                    {cls}
                  </label>
                ))}
              </div>
              {errors.classes && (
                <p className="text-sm text-destructive">{errors.classes}</p>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/events")}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                )}
                创建活动
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
