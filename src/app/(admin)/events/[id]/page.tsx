"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { useAttendanceStats } from "@/hooks/use-attendance-stats";
import { AttendanceStatsCard } from "@/components/attendance-stats-card";
import { ClassProgressBar } from "@/components/class-progress-bar";
import { CLASS_NAMES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CalendarDays, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";
import { formatDateWithWeekday } from "@/lib/utils";

type Event = Tables<"events">;

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<
    { id: string; class_name: string; family_id: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Realtime attendance data
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(eventId);

  // Attendance stats
  const { classStats, overallStats } = useAttendanceStats({
    familyAttendance,
    studentAttendance,
    students,
  });

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [eventResult, studentsResult] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId).single(),
        supabase
          .from("students")
          .select("id, class_name, family_id")
          .order("class_name"),
      ]);

      if (eventResult.error) {
        console.error("Failed to fetch event:", eventResult.error);
        toast.error("无法加载活动");
        router.push("/events");
        return;
      }

      setEvent(eventResult.data);
      setStudents(studentsResult.data ?? []);
      setLoading(false);
    }

    fetchData();
  }, [eventId, router]);

  async function handleDelete() {
    if (!event) return;
    if (!confirm(`确认删除活动「${event.name}」？此操作不可撤销，所有签到记录也将被删除。`)) return;

    setDeleting(true);
    const supabase = createClient();

    // Delete attendance records first, then the event
    await Promise.all([
      supabase.from("family_attendance").delete().eq("event_id", event.id),
      supabase.from("student_attendance").delete().eq("event_id", event.id),
    ]);

    const { error } = await supabase.from("events").delete().eq("id", event.id);

    if (error) {
      console.error("Failed to delete event:", error);
      toast.error("删除失败，请重试");
      setDeleting(false);
    } else {
      toast.success(`活动「${event.name}」已删除`);
      router.push("/events");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" onClick={() => router.push("/events")}>
        <ArrowLeft className="size-4" data-icon="inline-start" />
        返回活动列表
      </Button>

      {/* Event header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" />
            <span>{formatDateWithWeekday(event.date)}</span>
          </div>
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}
        </div>

        {/* Delete button */}
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Trash2 className="size-4" data-icon="inline-start" />
          )}
          删除活动
        </Button>
      </div>

      <Separator />

      {/* Loading attendance */}
      {attendanceLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Overall stats cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {event.track_family && (
              <AttendanceStatsCard
                title="家庭出席率"
                value={`${overallStats.checkedInFamilies}/${overallStats.totalFamilies}`}
                percentage={Math.round(overallStats.familyRate * 100)}
                description="已签到家庭 / 总家庭数"
              />
            )}
            {event.track_student && (
              <AttendanceStatsCard
                title="学生出席率"
                value={`${overallStats.checkedInStudents}/${overallStats.totalStudents}`}
                percentage={Math.round(overallStats.studentRate * 100)}
                description="已签到学生 / 总学生数"
              />
            )}
          </div>

          {/* Per-class breakdown */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">各班出席情况</h2>
            <div className="space-y-3">
              {CLASS_NAMES.map((cls) => {
                const stat = classStats.find((s) => s.className === cls);
                if (!stat) return null;

                if (event.track_family) {
                  return (
                    <ClassProgressBar
                      key={cls}
                      className={cls}
                      checkedIn={stat.checkedInFamilies}
                      total={stat.totalFamilies}
                    />
                  );
                }

                if (event.track_student) {
                  return (
                    <ClassProgressBar
                      key={cls}
                      className={cls}
                      checkedIn={stat.checkedInStudents}
                      total={stat.totalStudents}
                    />
                  );
                }

                return null;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
