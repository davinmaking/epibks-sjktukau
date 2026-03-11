"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, CalendarDays, Users, GraduationCap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { Tables } from "@/lib/types";
import { formatDateWithWeekday } from "@/lib/utils";

type Event = Tables<"events">;

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchEvents() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Failed to fetch events:", error);
    } else {
      setEvents(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  async function handleDelete(e: React.MouseEvent, eventId: string, eventName: string) {
    e.stopPropagation();
    if (!confirm(`确认删除活动「${eventName}」？此操作不可撤销。`)) return;

    setDeletingId(eventId);
    const supabase = createClient();

    // Delete attendance records first, then the event
    const [familyDelResult, studentDelResult] = await Promise.all([
      supabase.from("family_attendance").delete().eq("event_id", eventId),
      supabase.from("student_attendance").delete().eq("event_id", eventId),
    ]);

    if (familyDelResult.error || studentDelResult.error) {
      console.error("Failed to delete attendance records:", familyDelResult.error, studentDelResult.error);
      toast.error("删除签到记录失败，请重试");
      setDeletingId(null);
      return;
    }

    const { error } = await supabase.from("events").delete().eq("id", eventId);

    if (error) {
      console.error("Failed to delete event:", error);
      toast.error("删除失败，请重试");
    } else {
      toast.success(`活动「${eventName}」已删除`);
      fetchEvents();
    }
    setDeletingId(null);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">活动管理</h1>
          <p className="text-sm text-muted-foreground">
            共 {events.length} 个活动
          </p>
        </div>
        <Button render={<Link href="/events/new" />}>
          <Plus className="size-4" data-icon="inline-start" />
          创建活动
        </Button>
      </div>

      {/* Event cards */}
      {events.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <CalendarDays className="size-12" />
          <p className="text-lg font-medium">暂无活动</p>
          <p className="text-sm">点击「创建活动」开始添加</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const isPast = event.date < new Date().toISOString().split("T")[0];
            return (
              <Card
                key={event.id}
                className={`cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${isPast ? "opacity-50" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/events/${event.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/events/${event.id}`);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2 text-base">
                      {event.name}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(e, event.id, event.name)}
                      disabled={deletingId === event.id}
                      aria-label={`删除活动「${event.name}」`}
                    >
                      {deletingId === event.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
