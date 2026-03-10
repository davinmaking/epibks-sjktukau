"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, CalendarDays } from "lucide-react";
import type { Tables } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Event = Tables<"events">;

interface EventWithRate extends Event {
  checkedIn: number;
  totalFamilies: number;
}

export default function TeacherAttendancePage() {
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

      // Fetch ongoing events
      const { data: eventsData, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .eq("status", "ongoing")
        .order("date", { ascending: false });

      if (eventsError || !eventsData) {
        console.error("Failed to fetch events:", eventsError);
        setLoading(false);
        return;
      }

      // Get total families in this teacher's class
      const { data: studentsData } = await supabase
        .from("students")
        .select("family_id")
        .eq("class_name", teacher!.class_name!);

      const uniqueFamilyIds = new Set(
        (studentsData ?? [])
          .map((s) => s.family_id)
          .filter((id): id is string => id !== null)
      );
      const totalFamilies = uniqueFamilyIds.size;

      // For each event, get the check-in count for this class
      const eventsWithRates: EventWithRate[] = await Promise.all(
        eventsData.map(async (event) => {
          const { count } = await supabase
            .from("family_attendance")
            .select("*", { count: "exact", head: true })
            .eq("event_id", event.id)
            .eq("class_name", teacher!.class_name!);

          return {
            ...event,
            checkedIn: count ?? 0,
            totalFamilies,
          };
        })
      );

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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">签到活动</h1>
        <p className="text-sm text-muted-foreground">
          {teacher.class_name} 班
        </p>
      </div>

      {events.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
          <CalendarDays className="size-10" />
          <p>暂无进行中的活动</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => {
            const rate =
              event.totalFamilies > 0
                ? Math.round((event.checkedIn / event.totalFamilies) * 100)
                : 0;

            return (
              <Card
                key={event.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => router.push(`/attendance/${event.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{event.name}</CardTitle>
                    <Badge variant="secondary">进行中</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" />
                    <span>{formatDate(event.date)}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {event.track_family && (
                      <Badge variant="outline">家庭</Badge>
                    )}
                    {event.track_student && (
                      <Badge variant="outline">学生</Badge>
                    )}
                  </div>

                  {event.track_family && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          班级出席率
                        </span>
                        <span className="font-medium">
                          {event.checkedIn}/{event.totalFamilies} ({rate}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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
