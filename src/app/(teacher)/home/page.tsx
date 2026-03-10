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

export default function TeacherDashboardPage() {
  const { teacher } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const supabase = createClient();

      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: false })
        .limit(10);

      setEvents(eventsData ?? []);
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
      <div className="flex h-64 items-center justify-center">
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
