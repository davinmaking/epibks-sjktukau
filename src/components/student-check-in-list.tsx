"use client";

import { useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";

type StudentAttendance = Tables<"student_attendance">;

interface StudentCheckInListProps {
  students: Array<{ id: string; name: string; class_name: string }>;
  studentAttendance: StudentAttendance[];
  eventId: string;
  teacherId: string;
}

export function StudentCheckInList({
  students,
  studentAttendance,
  eventId,
  teacherId,
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
          console.error("Failed to remove attendance:", error.message, error.code, error.details);
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
          console.error("Failed to check in student:", error.message, error.code, error.details);
          toast.error("签到失败");
        }
      }

      // Remove from loading set
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    },
    [eventId, teacherId]
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索学生姓名..."
          aria-label="搜索学生姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Student list */}
      <div className="space-y-1">
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
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                {isLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Checkbox
                    checked={isCheckedIn}
                    onCheckedChange={() =>
                      handleToggle(student.id, isCheckedIn)
                    }
                    disabled={isLoading}
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
