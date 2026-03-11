"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pie, PieChart } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { useAttendanceStats } from "@/hooks/use-attendance-stats";
import { ClassProgressBar } from "@/components/class-progress-bar";
import { CLASS_NAMES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Plus,
  ArrowRight,
  Loader2,
} from "lucide-react";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;

interface QuickStats {
  totalStudents: number;
  totalFamilies: number;
  totalTeachers: number;
  totalEvents: number;
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
  const [loading, setLoading] = useState(true);

  // Realtime attendance for ongoing event
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(ongoingEvent?.id ?? null);

  // Filter students by included classes for ongoing event
  const includedStudents = ongoingEvent?.included_classes
    ? students.filter((s) => ongoingEvent.included_classes!.includes(s.class_name))
    : students;

  // Attendance stats for ongoing event
  const { classStats, overallStats } = useAttendanceStats({
    familyAttendance,
    studentAttendance,
    students: includedStudents,
  });

  // Colors: different shades of cyan/teal for checked-in classes, red for not checked in
  const CLASS_COLORS: Record<string, string> = {
    PRASEKOLAH: "oklch(0.85 0.12 185)",
    JOYFUL: "oklch(0.80 0.13 190)",
    SUNSHINE: "oklch(0.75 0.14 185)",
    "T1 TEKUN": "oklch(0.70 0.15 190)",
    "T2 KREATIF": "oklch(0.65 0.15 185)",
    "T3 BERDIKARI": "oklch(0.60 0.14 190)",
    "T4 BERJUANG": "oklch(0.55 0.13 185)",
    "T5 SABAR": "oklch(0.50 0.12 190)",
    "T6 BERJAYA": "oklch(0.45 0.11 185)",
  };
  const NOT_CHECKED_IN_COLOR = "oklch(0.65 0.20 25)";

  // Pie chart data: one slice per class (checked-in count) + one "未签到" slice
  const familyPieData = useMemo(() => {
    if (!ongoingEvent?.track_family || classStats.length === 0) return null;
    const slices: { className: string; count: number; fill: string }[] = [];
    for (const stat of classStats) {
      if (stat.checkedInFamilies > 0) {
        slices.push({
          className: stat.className,
          count: stat.checkedInFamilies,
          fill: CLASS_COLORS[stat.className] ?? "var(--chart-1)",
        });
      }
    }
    const totalCheckedIn = overallStats.classLevelCheckedInFamilies;
    const notCheckedIn = overallStats.classLevelTotalFamilies - totalCheckedIn;
    if (notCheckedIn > 0) {
      slices.push({
        className: "notCheckedIn",
        count: notCheckedIn,
        fill: NOT_CHECKED_IN_COLOR,
      });
    }
    return slices;
  }, [ongoingEvent?.track_family, classStats, overallStats.classLevelCheckedInFamilies, overallStats.classLevelTotalFamilies]);

  const studentPieData = useMemo(() => {
    if (!ongoingEvent?.track_student || classStats.length === 0) return null;
    const slices: { className: string; count: number; fill: string }[] = [];
    for (const stat of classStats) {
      if (stat.checkedInStudents > 0) {
        slices.push({
          className: stat.className,
          count: stat.checkedInStudents,
          fill: CLASS_COLORS[stat.className] ?? "var(--chart-1)",
        });
      }
    }
    const notCheckedIn = overallStats.totalStudents - overallStats.checkedInStudents;
    if (notCheckedIn > 0) {
      slices.push({
        className: "notCheckedIn",
        count: notCheckedIn,
        fill: NOT_CHECKED_IN_COLOR,
      });
    }
    return slices;
  }, [ongoingEvent?.track_student, classStats, overallStats.checkedInStudents, overallStats.totalStudents]);

  // Build chart config dynamically from class names
  const pieChartConfig = useMemo(() => {
    const config: ChartConfig = { count: { label: "人数" } };
    for (const cls of CLASS_NAMES) {
      config[cls] = { label: cls, color: CLASS_COLORS[cls] ?? "var(--chart-1)" };
    }
    config.notCheckedIn = { label: "未签到", color: NOT_CHECKED_IN_COLOR };
    return config;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboardData() {
      const supabase = createClient();

      const [
        ongoingResult,
        studentsResult,
        studentCountResult,
        familyCountResult,
        teacherCountResult,
        eventCountResult,
      ] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .gte("date", new Date().toISOString().split("T")[0])
          .order("date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("students")
          .select("id, class_name, family_id")
          .order("class_name"),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("students")
          .select("family_id")
          .not("family_id", "is", null),
        supabase
          .from("teachers")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true }),
      ]);

      if (cancelled) return;

      if (ongoingResult.data) {
        setOngoingEvent(ongoingResult.data);
      }

      setStudents(studentsResult.data ?? []);

      const uniqueFamilyIds = new Set(
        (familyCountResult.data ?? [])
          .map((r) => r.family_id)
          .filter(Boolean)
      );

      setQuickStats({
        totalStudents: studentCountResult.count ?? 0,
        totalFamilies: uniqueFamilyIds.size,
        totalTeachers: teacherCountResult.count ?? 0,
        totalEvents: eventCountResult.count ?? 0,
      });

      setLoading(false);
    }

    fetchDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="加载中">
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

      {/* Section 1: Quick Stats */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">数据概览</h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
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

      {/* Section 2: Active Event */}
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
                <div className="flex h-24 items-center justify-center" role="status" aria-label="加载出席数据">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Pie charts */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {ongoingEvent.track_family && familyPieData && (
                      <Card>
                        <CardHeader className="items-center pb-0">
                          <CardTitle className="text-sm">总出席率</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 pb-0">
                          <ChartContainer
                            config={pieChartConfig}
                            className="mx-auto aspect-square max-h-[200px] pb-0 [&_.recharts-pie-label-text]:fill-foreground"
                          >
                            <PieChart>
                              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                              <Pie data={familyPieData} dataKey="count" label nameKey="className" />
                            </PieChart>
                          </ChartContainer>
                        </CardContent>
                        <div className="p-4 pt-2 text-center">
                          <p className="text-2xl font-bold">
                            {Math.round(overallStats.classLevelFamilyRate * 100)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {overallStats.classLevelCheckedInFamilies}/{overallStats.classLevelTotalFamilies} 按班级累计
                          </p>
                        </div>
                      </Card>
                    )}
                    {ongoingEvent.track_student && studentPieData && (
                      <Card>
                        <CardHeader className="items-center pb-0">
                          <CardTitle className="text-sm">学生出席率</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 pb-0">
                          <ChartContainer
                            config={pieChartConfig}
                            className="mx-auto aspect-square max-h-[200px] pb-0 [&_.recharts-pie-label-text]:fill-foreground"
                          >
                            <PieChart>
                              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                              <Pie data={studentPieData} dataKey="count" label nameKey="className" />
                            </PieChart>
                          </ChartContainer>
                        </CardContent>
                        <div className="p-4 pt-2 text-center">
                          <p className="text-2xl font-bold">
                            {Math.round(overallStats.studentRate * 100)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {overallStats.checkedInStudents}/{overallStats.totalStudents} 已签到学生
                          </p>
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* Per-class breakdown */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      各班出席情况
                    </h3>
                    <div className="space-y-2">
                      {(ongoingEvent?.included_classes ?? CLASS_NAMES).map((cls) => {
                        const stat = classStats.find(
                          (s) => s.className === cls
                        );
                        if (!stat) return null;

                        if (ongoingEvent.track_family) {
                          return (
                            <ClassProgressBar
                              key={cls}
                              classLabel={cls}
                              checkedIn={stat.checkedInFamilies}
                              total={stat.totalFamilies}
                            />
                          );
                        }

                        if (ongoingEvent.track_student) {
                          return (
                            <ClassProgressBar
                              key={cls}
                              classLabel={cls}
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
    </div>
  );
}
