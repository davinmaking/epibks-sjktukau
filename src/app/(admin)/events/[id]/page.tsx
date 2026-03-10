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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;

const STATUS_LABELS: Record<string, string> = {
  upcoming: "即将开始",
  ongoing: "进行中",
  completed: "已结束",
};

const STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  upcoming: "default",
  ongoing: "secondary",
  completed: "outline",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<
    { id: string; class_name: string; family_id: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  async function handleStatusChange(newStatus: string | null) {
    if (!newStatus || !event) return;
    setUpdatingStatus(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({ status: newStatus })
      .eq("id", event.id);

    if (error) {
      console.error("Failed to update status:", error);
      toast.error("状态更新失败");
    } else {
      setEvent({ ...event, status: newStatus });
      toast.success(`状态已更新为「${STATUS_LABELS[newStatus] ?? newStatus}」`);
    }
    setUpdatingStatus(false);
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
            <span>{formatDate(event.date)}</span>
          </div>
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}
        </div>

        {/* Status selector */}
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_BADGE_VARIANT[event.status] ?? "default"}>
            {STATUS_LABELS[event.status] ?? event.status}
          </Badge>
          <Select
            value={event.status}
            onValueChange={handleStatusChange}
            disabled={updatingStatus}
          >
            <SelectTrigger>
              <SelectValue placeholder="更改状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">即将开始</SelectItem>
              <SelectItem value="ongoing">进行中</SelectItem>
              <SelectItem value="completed">已结束</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
