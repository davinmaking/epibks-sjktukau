"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;

interface EventWithStats extends Event {
  familyCheckedIn: number;
  totalFamilies: number;
}

export default function TeacherDashboardPage() {
  const { teacher } = useAuth();
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const supabase = createClient();

      // Fetch events and class data in parallel
      const [eventsRes, studentsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .order("date", { ascending: false })
          .limit(10),
        supabase
          .from("students")
          .select("family_id")
          .eq("class_name", teacher!.class_name!),
      ]);

      const eventsData = eventsRes.data ?? [];
      const studentsList = studentsRes.data ?? [];

      // Count unique families in this class
      const uniqueFamilyIds = new Set(
        studentsList.map((s) => s.family_id).filter((id): id is string => id !== null)
      );
      const totalFamilies = uniqueFamilyIds.size;

      // Batch fetch attendance for families in this class (by family_id, not class_name)
      // This ensures families checked in by other classes' teachers are also counted
      const eventIds = eventsData.map((e) => e.id);
      const { data: attendanceData } = await supabase
        .from("family_attendance")
        .select("event_id")
        .in("event_id", eventIds)
        .in("family_id", [...uniqueFamilyIds]);

      // Count per event
      const countByEvent = new Map<string, number>();
      for (const record of attendanceData ?? []) {
        countByEvent.set(record.event_id, (countByEvent.get(record.event_id) ?? 0) + 1);
      }

      // Filter events that include this teacher's class
      const relevantEvents = eventsData.filter((event) =>
        !event.included_classes || event.included_classes.includes(teacher!.class_name!)
      );

      const eventsWithStats: EventWithStats[] = relevantEvents.map((event) => ({
        ...event,
        familyCheckedIn: countByEvent.get(event.id) ?? 0,
        totalFamilies,
      }));

      setEvents(eventsWithStats);
      setLoading(false);
    }

    fetchData();
  }, [teacher]);

  // Active events: upcoming/today events, or fallback to the 2 most recent
  const activeEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter((e) => e.date >= today);
    if (upcoming.length > 0) {
      return upcoming.sort((a, b) => a.date.localeCompare(b.date));
    }
    return events.slice(0, 2);
  }, [events]);

  if (!teacher?.class_name) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Users className="size-12" />
        <p className="text-lg">您尚未被分配班级</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="加载中">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          {teacher.class_name} 班
        </p>
      </div>

      {/* Active Events */}
      {activeEvents.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarDays className="size-4" />
            活动签到
          </h2>
          <div className="grid gap-2">
            {activeEvents.map((evt) => {
              const isToday =
                evt.date === new Date().toISOString().slice(0, 10);
              const isPast =
                evt.date < new Date().toISOString().slice(0, 10);

              const rate =
                evt.totalFamilies > 0
                  ? Math.round((evt.familyCheckedIn / evt.totalFamilies) * 100)
                  : 0;

              return (
                <Link
                  key={evt.id}
                  href={`/attendance/${evt.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{evt.name}</p>
                      {isToday && (
                        <Badge variant="default" className="text-xs">
                          今天
                        </Badge>
                      )}
                      {isPast && (
                        <Badge variant="secondary" className="text-xs">
                          已结束
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(evt.date)}
                    </p>
                    {evt.track_family && evt.totalFamilies > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>家庭出席</span>
                          <span className="font-medium text-foreground">
                            {evt.familyCheckedIn}/{evt.totalFamilies} ({rate}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
          <CalendarDays className="size-10" />
          <p>暂无活动</p>
        </div>
      )}
    </div>
  );
}
