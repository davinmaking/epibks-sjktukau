"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { useAttendanceStats } from "@/hooks/use-attendance-stats";
import { AttendanceStatsCard } from "@/components/attendance-stats-card";
import { ClassProgressBar } from "@/components/class-progress-bar";
import { CLASS_NAMES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Users,
  BarChart3,
  Plus,
  ArrowRight,
  Loader2,
} from "lucide-react";
import type { Tables } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Event = Tables<"events">;

interface QuickStats {
  totalStudents: number;
  totalFamilies: number;
  totalTeachers: number;
  totalEvents: number;
}

interface RecentEventWithStats {
  event: Event;
  familyCheckedIn: number;
  totalFamilies: number;
  studentCheckedIn: number;
  totalStudents: number;
}

export default function DashboardPage() {
  const [ongoingEvent, setOngoingEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<
    { id: string; class_name: string; family_id: string | null }[]
  >([]);
  const [quickStats, setQuickStats] = useState<QuickStats>({
    totalStudents: 0,
    totalFamilies: 0,
    totalTeachers: 0,
    totalEvents: 0,
  });
  const [recentEvents, setRecentEvents] = useState<RecentEventWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Realtime attendance for ongoing event
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(ongoingEvent?.id ?? null);

  // Attendance stats for ongoing event
  const { classStats, overallStats } = useAttendanceStats({
    familyAttendance,
    studentAttendance,
    students,
  });

  useEffect(() => {
    async function fetchDashboardData() {
      const supabase = createClient();

      // Fetch ongoing event, all students, and quick stats in parallel
      const [
        ongoingResult,
        studentsResult,
        studentCountResult,
        familyCountResult,
        teacherCountResult,
        eventCountResult,
        recentEventsResult,
      ] = await Promise.all([
        // Latest event (by date, most recent first)
        supabase
          .from("events")
          .select("*")
          .gte("date", new Date().toISOString().split("T")[0])
          .order("date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        // All students (for stats computation)
        supabase
          .from("students")
          .select("id, class_name, family_id")
          .order("class_name"),
        // Quick stats: total students
        supabase
          .from("students")
          .select("id", { count: "exact", head: true }),
        // Quick stats: distinct families
        supabase
          .from("students")
          .select("family_id")
          .not("family_id", "is", null),
        // Quick stats: total teachers
        supabase
          .from("teachers")
          .select("id", { count: "exact", head: true }),
        // Quick stats: total events
        supabase
          .from("events")
          .select("id", { count: "exact", head: true }),
        // Recent past events
        supabase
          .from("events")
          .select("*")
          .lt("date", new Date().toISOString().split("T")[0])
          .order("date", { ascending: false })
          .limit(3),
      ]);

      // Set ongoing event
      if (ongoingResult.data) {
        setOngoingEvent(ongoingResult.data);
      }

      // Set students
      setStudents(studentsResult.data ?? []);

      // Count distinct families
      const uniqueFamilyIds = new Set(
        (familyCountResult.data ?? [])
          .map((r) => r.family_id)
          .filter(Boolean)
      );

      // Set quick stats
      setQuickStats({
        totalStudents: studentCountResult.count ?? 0,
        totalFamilies: uniqueFamilyIds.size,
        totalTeachers: teacherCountResult.count ?? 0,
        totalEvents: eventCountResult.count ?? 0,
      });

      // Fetch attendance stats for recent events
      const recentEventsData = recentEventsResult.data ?? [];
      if (recentEventsData.length > 0) {
        const eventIds = recentEventsData.map((e) => e.id);

        const [familyAttResult, studentAttResult] = await Promise.all([
          supabase
            .from("family_attendance")
            .select("event_id, family_id")
            .in("event_id", eventIds),
          supabase
            .from("student_attendance")
            .select("event_id, student_id")
            .in("event_id", eventIds),
        ]);

        // Count per event
        const familyAttByEvent = new Map<string, Set<string>>();
        for (const fa of familyAttResult.data ?? []) {
          if (!familyAttByEvent.has(fa.event_id)) {
            familyAttByEvent.set(fa.event_id, new Set());
          }
          familyAttByEvent.get(fa.event_id)!.add(fa.family_id);
        }

        const studentAttByEvent = new Map<string, Set<string>>();
        for (const sa of studentAttResult.data ?? []) {
          if (!studentAttByEvent.has(sa.event_id)) {
            studentAttByEvent.set(sa.event_id, new Set());
          }
          studentAttByEvent.get(sa.event_id)!.add(sa.student_id);
        }

        const recentWithStats: RecentEventWithStats[] = recentEventsData.map(
          (event) => ({
            event,
            familyCheckedIn: familyAttByEvent.get(event.id)?.size ?? 0,
            totalFamilies: uniqueFamilyIds.size,
            studentCheckedIn: studentAttByEvent.get(event.id)?.size ?? 0,
            totalStudents: studentCountResult.count ?? 0,
          })
        );

        setRecentEvents(recentWithStats);
      }

      setLoading(false);
    }

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          学校出席管理系统概览
        </p>
      </div>

      {/* Section 1: Active Event */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">当前活动</h2>

        {ongoingEvent ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {ongoingEvent.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {attendanceLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Overall stats */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {ongoingEvent.track_family && (
                      <AttendanceStatsCard
                        title="家庭出席率"
                        value={`${overallStats.checkedInFamilies}/${overallStats.totalFamilies}`}
                        percentage={Math.round(overallStats.familyRate * 100)}
                        description="已签到家庭 / 总家庭数"
                      />
                    )}
                    {ongoingEvent.track_student && (
                      <AttendanceStatsCard
                        title="学生出席率"
                        value={`${overallStats.checkedInStudents}/${overallStats.totalStudents}`}
                        percentage={Math.round(overallStats.studentRate * 100)}
                        description="已签到学生 / 总学生数"
                      />
                    )}
                  </div>

                  {/* Per-class breakdown */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      各班出席情况
                    </h3>
                    <div className="space-y-2">
                      {CLASS_NAMES.map((cls) => {
                        const stat = classStats.find(
                          (s) => s.className === cls
                        );
                        if (!stat) return null;

                        if (ongoingEvent.track_family) {
                          return (
                            <ClassProgressBar
                              key={cls}
                              className={cls}
                              checkedIn={stat.checkedInFamilies}
                              total={stat.totalFamilies}
                            />
                          );
                        }

                        if (ongoingEvent.track_student) {
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

              <Separator />

              <Button
                variant="outline"
                render={<Link href={`/events/${ongoingEvent.id}`} />}
              >
                查看详情
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <Calendar className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">当前没有进行中的活动</p>
              <Button render={<Link href="/events/new" />}>
                <Plus className="size-4" data-icon="inline-start" />
                创建活动
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Section 2: Quick Stats */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">数据概览</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                学生总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {quickStats.totalStudents}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                家庭总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {quickStats.totalFamilies}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                教师总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {quickStats.totalTeachers}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                活动总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {quickStats.totalEvents}
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 3: Recent Events */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近活动</h2>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/events" />}
          >
            查看全部
            <ArrowRight className="size-4" data-icon="inline-end" />
          </Button>
        </div>

        {recentEvents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8">
              <Calendar className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">暂无已完成的活动</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentEvents.map(
              ({
                event,
                familyCheckedIn,
                totalFamilies,
                studentCheckedIn,
                totalStudents,
              }) => {
                const familyRate =
                  totalFamilies > 0
                    ? Math.round((familyCheckedIn / totalFamilies) * 100)
                    : 0;
                const studentRate =
                  totalStudents > 0
                    ? Math.round((studentCheckedIn / totalStudents) * 100)
                    : 0;

                return (
                  <Card
                    key={event.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                  >
                    <Link href={`/events/${event.id}`} className="block">
                      <CardHeader className="pb-2">
                        <CardTitle className="line-clamp-2 text-base">
                          {event.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="size-4 shrink-0" />
                          <span>{formatDate(event.date)}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm">
                          {event.track_family && (
                            <div className="flex items-center gap-1.5">
                              <Users className="size-3.5 text-muted-foreground" />
                              <span>
                                家庭 {familyCheckedIn}/{totalFamilies}
                              </span>
                              <span className="text-muted-foreground">
                                ({familyRate}%)
                              </span>
                            </div>
                          )}
                          {event.track_student && (
                            <div className="flex items-center gap-1.5">
                              <BarChart3 className="size-3.5 text-muted-foreground" />
                              <span>
                                学生 {studentCheckedIn}/{totalStudents}
                              </span>
                              <span className="text-muted-foreground">
                                ({studentRate}%)
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                );
              }
            )}
          </div>
        )}
      </section>

      {/* Section 4: Quick Actions */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">快捷操作</h2>
        <Card>
          <CardContent className="grid gap-3 py-4 grid-cols-2 lg:grid-cols-4">
            <Button render={<Link href="/events/new" />}>
              <Plus className="size-4" data-icon="inline-start" />
              创建活动
            </Button>
            <Button
              variant="outline"
              render={<Link href="/reports" />}
            >
              <BarChart3 className="size-4" data-icon="inline-start" />
              查看报告
            </Button>
            <Button
              variant="outline"
              render={<Link href="/students" />}
            >
              <Users className="size-4" data-icon="inline-start" />
              管理学生
            </Button>
            <Button
              variant="outline"
              render={<Link href="/users" />}
            >
              <Users className="size-4" data-icon="inline-start" />
              管理用户
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
