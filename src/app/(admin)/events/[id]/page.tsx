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
import { ArrowLeft, CalendarDays, ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";
import { formatDateWithWeekday } from "@/lib/utils";

interface AttendeeEntry {
  type: string;
  name: string;
  ic: string;
  relationship: string;
}

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
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  // Realtime attendance data
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(eventId);

  // Filter students by included classes (null = all classes)
  const includedStudents = event?.included_classes
    ? students.filter((s) => event.included_classes!.includes(s.class_name))
    : students;

  // Attendance stats
  const { classStats, overallStats } = useAttendanceStats({
    familyAttendance,
    studentAttendance,
    students: includedStudents,
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
    const [familyDelResult, studentDelResult] = await Promise.all([
      supabase.from("family_attendance").delete().eq("event_id", event.id),
      supabase.from("student_attendance").delete().eq("event_id", event.id),
    ]);

    if (familyDelResult.error || studentDelResult.error) {
      console.error("Failed to delete attendance records:", familyDelResult.error, studentDelResult.error);
      toast.error("删除签到记录失败，请重试");
      setDeleting(false);
      return;
    }

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
      <div className="flex h-64 items-center justify-center" role="status" aria-label="加载中">
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
        <div className="flex h-32 items-center justify-center" role="status" aria-label="加载出席数据">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Overall stats cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {event.track_family && (
              <AttendanceStatsCard
                title="总出席率"
                value={`${overallStats.classLevelCheckedInFamilies}/${overallStats.classLevelTotalFamilies}`}
                percentage={Math.round(overallStats.classLevelFamilyRate * 100)}
                description={`按班级累计 · 唯一家庭 ${overallStats.checkedInFamilies}/${overallStats.totalFamilies}`}
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
            {event.included_classes && (
              <p className="text-xs text-muted-foreground">
                此活动包含 {event.included_classes.length}/{CLASS_NAMES.length} 个班级
              </p>
            )}
            <p className="text-xs text-muted-foreground">点击班级查看出席详情</p>
            <div className="space-y-3">
              {(event.included_classes ?? CLASS_NAMES).map((cls) => {
                const stat = classStats.find((s) => s.className === cls);
                if (!stat) return null;
                const isExpanded = expandedClass === cls;

                // Get attendance records for this class
                const classAttendanceRecords = familyAttendance.filter(
                  (fa) => fa.class_name === cls
                );
                // Also find families in this class that were checked in by another class (sibling sync)
                const classFamilyIds = new Set(
                  includedStudents
                    .filter((s) => s.class_name === cls && s.family_id)
                    .map((s) => s.family_id!)
                );
                const siblingRecords = familyAttendance.filter(
                  (fa) => fa.class_name !== cls && classFamilyIds.has(fa.family_id)
                );

                const checkedIn = event.track_family ? stat.checkedInFamilies : stat.checkedInStudents;
                const total = event.track_family ? stat.totalFamilies : stat.totalStudents;

                if (!event.track_family && !event.track_student) return null;

                return (
                  <div key={cls}>
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedClass(isExpanded ? null : cls)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <ClassProgressBar
                            classLabel={cls}
                            checkedIn={checkedIn}
                            total={total}
                          />
                        </div>
                      </div>
                    </button>

                    {isExpanded && event.track_family && (
                      <div className="ml-6 mt-2 space-y-2">
                        {classAttendanceRecords.length === 0 && siblingRecords.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">暂无签到记录</p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="px-3 py-2 text-left font-medium">出席者</th>
                                  <th className="px-3 py-2 text-left font-medium">身份证</th>
                                  <th className="px-3 py-2 text-left font-medium">关系</th>
                                  <th className="px-3 py-2 text-left font-medium">来源</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...classAttendanceRecords, ...siblingRecords].map((record) => {
                                  const attendees = (record.attendees as unknown as AttendeeEntry[]) ?? [];
                                  const isSibling = record.class_name !== cls;

                                  if (attendees.length > 0) {
                                    return attendees.map((att, i) => (
                                      <tr key={`${record.id}-${i}`} className="border-b">
                                        <td className="px-3 py-2 font-medium">{att.name || "-"}</td>
                                        <td className="px-3 py-2 font-mono">{att.ic || "-"}</td>
                                        <td className="px-3 py-2">{att.relationship || att.type || "-"}</td>
                                        <td className="px-3 py-2">
                                          {isSibling ? (
                                            <span className="text-blue-600 dark:text-blue-400">
                                              {record.class_name}
                                            </span>
                                          ) : (
                                            "本班"
                                          )}
                                        </td>
                                      </tr>
                                    ));
                                  }

                                  return (
                                    <tr key={record.id} className="border-b">
                                      <td className="px-3 py-2 font-medium">{record.attendee_name || "-"}</td>
                                      <td className="px-3 py-2 font-mono">{record.attendee_ic || "-"}</td>
                                      <td className="px-3 py-2">{record.attendee_relationship || record.attendee_type || "-"}</td>
                                      <td className="px-3 py-2">
                                        {isSibling ? (
                                          <span className="text-blue-600 dark:text-blue-400">
                                            {record.class_name}
                                          </span>
                                        ) : (
                                          "本班"
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
