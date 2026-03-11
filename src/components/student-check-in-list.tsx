"use client";

import { useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";

type StudentAttendance = Tables<"student_attendance">;

interface StudentCheckInListProps {
  students: Array<{ id: string; name: string; class_name: string }>;
  studentAttendance: StudentAttendance[];
  eventId: string;
  teacherId: string;
  onMutate?: () => void;
}

export function StudentCheckInList({
  students,
  studentAttendance,
  eventId,
  teacherId,
  onMutate,
}: StudentCheckInListProps) {
  const [search, setSearch] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  // Build a set of checked-in student IDs for quick lookup
  const checkedInStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const sa of studentAttendance) {
      set.add(sa.student_id);
    }
    return set;
  }, [studentAttendance]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const query = search.toLowerCase();
    return students.filter((s) => s.name.toLowerCase().includes(query));
  }, [students, search]);

  const [batchLoading, setBatchLoading] = useState(false);

  // Batch check-in: mark all unchecked students as present
  const handleSelectAll = useCallback(async () => {
    const unchecked = students.filter((s) => !checkedInStudentIds.has(s.id));
    if (unchecked.length === 0) return;

    setBatchLoading(true);
    const supabase = createClient();

    const records = unchecked.map((s) => ({
      event_id: eventId,
      student_id: s.id,
      checked_in_by: teacherId,
    }));

    const { error } = await supabase
      .from("student_attendance")
      .upsert(records, { onConflict: "event_id,student_id" });

    setBatchLoading(false);

    if (error) {
      console.error("Batch check-in failed:", error.message);
      toast.error("批量签到失败");
    } else {
      toast.success(`已签到 ${unchecked.length} 名学生`);
      onMutate?.();
    }
  }, [students, checkedInStudentIds, eventId, teacherId, onMutate]);

  // Batch undo: uncheck all checked students
  const handleUnselectAll = useCallback(async () => {
    if (checkedInStudentIds.size === 0) return;

    setBatchLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("student_attendance")
      .delete()
      .eq("event_id", eventId)
      .in("student_id", [...checkedInStudentIds]);

    setBatchLoading(false);

    if (error) {
      console.error("Batch undo failed:", error.message);
      toast.error("批量取消签到失败");
    } else {
      toast.success("已取消所有学生签到");
      onMutate?.();
    }
  }, [checkedInStudentIds, eventId, onMutate]);

  const allCheckedIn = checkedInStudentIds.size === students.length && students.length > 0;
  const noneCheckedIn = checkedInStudentIds.size === 0;

  const handleToggle = useCallback(
    async (studentId: string, isCurrentlyCheckedIn: boolean) => {
      // Add to loading set
      setLoadingIds((prev) => new Set(prev).add(studentId));

      const supabase = createClient();

      if (isCurrentlyCheckedIn) {
        // Delete attendance record
        const { error } = await supabase
          .from("student_attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("student_id", studentId);

        if (error) {
          console.error("Failed to remove attendance:", error.message);
          toast.error("取消签到失败");
        }
      } else {
        // Upsert to handle potential duplicate key from stale realtime state
        const { error } = await supabase.from("student_attendance").upsert(
          {
            event_id: eventId,
            student_id: studentId,
            checked_in_by: teacherId,
          },
          { onConflict: "event_id,student_id" }
        );

        if (error) {
          console.error("Failed to check in student:", error.message);
          toast.error("签到失败");
        }
      }

      // Remove from loading set
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });

      // Refetch as fallback in case realtime doesn't deliver the update
      onMutate?.();
    },
    [eventId, teacherId, onMutate]
  );

  return (
    <div className="touch-manipulation space-y-3">
      {/* Search bar + select all */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索学生姓名..."
            aria-label="搜索学生姓名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[44px] pl-9"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
        <Button
          variant={allCheckedIn ? "default" : "outline"}
          className="min-h-[44px] gap-1.5 whitespace-nowrap"
          onClick={allCheckedIn ? handleUnselectAll : handleSelectAll}
          disabled={batchLoading}
        >
          {batchLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCheck className="size-4" />
          )}
          {allCheckedIn ? "取消全选" : "全选"}
        </Button>
      </div>

      {/* Student list */}
      <div className="space-y-1.5">
        {filteredStudents.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            无匹配的学生
          </div>
        ) : (
          filteredStudents.map((student) => {
            const isCheckedIn = checkedInStudentIds.has(student.id);
            const isLoading = loadingIds.has(student.id);

            return (
              <label
                key={student.id}
                className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                  isCheckedIn
                    ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                    : "hover:border-primary/30 hover:shadow-sm"
                }`}
              >
                {isLoading ? (
                  <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Checkbox
                    checked={isCheckedIn}
                    onCheckedChange={() =>
                      handleToggle(student.id, isCheckedIn)
                    }
                    disabled={isLoading}
                    className="size-5"
                  />
                )}
                <span
                  className={
                    isCheckedIn ? "font-medium" : "text-muted-foreground"
                  }
                >
                  {student.name}
                </span>
              </label>
            );
          })
        )}
      </div>

      {/* Summary */}
      <p className="text-center text-xs text-muted-foreground">
        已签到 {checkedInStudentIds.size}/{students.length} 名学生
      </p>
    </div>
  );
}
