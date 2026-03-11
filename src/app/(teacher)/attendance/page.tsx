"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, CalendarDays, GraduationCap } from "lucide-react";
import type { Tables } from "@/lib/types";
import { formatDateWithWeekday } from "@/lib/utils";

type Event = Tables<"events">;

interface EventWithRate extends Event {
  checkedIn: number;
  totalFamilies: number;
}

export default function TeacherEventsPage() {
  const { teacher } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<EventWithRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }

    async function fetchEvents() {
      const supabase = createClient();

      const [eventsRes, studentsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .order("date", { ascending: false }),
        supabase
          .from("students")
          .select("family_id")
          .eq("class_name", teacher!.class_name!),
      ]);

      const eventsData = eventsRes.data ?? [];
      const studentsList = studentsRes.data ?? [];

      const uniqueFamilyIds = new Set(
        studentsList
          .map((s) => s.family_id)
          .filter((id): id is string => id !== null)
      );
      const totalFamilies = uniqueFamilyIds.size;

      const eventIds = eventsData.map((e) => e.id);
      const { data: attendanceData } = await supabase
        .from("family_attendance")
        .select("event_id, family_id")
        .in("event_id", eventIds)
        .in("family_id", [...uniqueFamilyIds]);

      // Count unique families per event
      const countByEvent = new Map<string, Set<string>>();
      for (const record of attendanceData ?? []) {
        if (!countByEvent.has(record.event_id)) {
          countByEvent.set(record.event_id, new Set());
        }
        countByEvent.get(record.event_id)!.add(record.family_id);
      }

      const relevantEvents = eventsData.filter(
        (event) =>
          !event.included_classes ||
          event.included_classes.includes(teacher!.class_name!)
      );

      const eventsWithRates: EventWithRate[] = relevantEvents.map((event) => ({
        ...event,
        checkedIn: countByEvent.get(event.id)?.size ?? 0,
        totalFamilies,
      }));

      setEvents(eventsWithRates);
      setLoading(false);
    }

    fetchEvents();
  }, [teacher]);

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
      <div>
        <h1 className="text-2xl font-bold">活动管理</h1>
        <p className="text-sm text-muted-foreground">
          {teacher.class_name} 班 · 共 {events.length} 个活动
        </p>
      </div>

      {events.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <CalendarDays className="size-12" />
          <p className="text-lg font-medium">暂无活动</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const isPast =
              event.date < new Date().toISOString().split("T")[0];
            const rate =
              event.totalFamilies > 0
                ? Math.round(
                    (event.checkedIn / event.totalFamilies) * 100
                  )
                : 0;

            return (
              <Card
                key={event.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${isPast ? "opacity-50" : ""}`}
                onClick={() => router.push(`/attendance/${event.id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="line-clamp-2 text-base">
                    {event.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" />
                    <span>{formatDateWithWeekday(event.date)}</span>
                  </div>
                  <div className="flex gap-2">
                    {event.track_family && (
                      <Badge variant="outline">
                        <Users className="size-3" />
                        家庭
                      </Badge>
                    )}
                    {event.track_student && (
                      <Badge variant="outline">
                        <GraduationCap className="size-3" />
                        学生
                      </Badge>
                    )}
                  </div>
                  {event.track_family && event.totalFamilies > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          班级出席率
                        </span>
                        <span className="font-medium">
                          {event.checkedIn}/{event.totalFamilies} ({rate}%)
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
