"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pie, PieChart } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
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
  ArrowRight,
  Loader2,
  Users,
} from "lucide-react";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;

const CHECKED_IN_COLOR = "oklch(0.65 0.20 250)";
const NOT_CHECKED_IN_COLOR = "oklch(0.65 0.22 25)";

const pieChartConfig = {
  count: { label: "人数" },
  checkedIn: { label: "已签到", color: CHECKED_IN_COLOR },
  notCheckedIn: { label: "未签到", color: NOT_CHECKED_IN_COLOR },
} satisfies ChartConfig;

export default function TeacherDashboardPage() {
  const { teacher } = useAuth();
  const [ongoingEvent, setOngoingEvent] = useState<Event | null>(null);
  const [classStudents, setClassStudents] = useState<
    { id: string; class_name: string; family_id: string | null }[]
  >([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalFamilies, setTotalFamilies] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);

  // Realtime attendance for ongoing event
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(ongoingEvent?.id ?? null);

  // Unique family IDs in this class
  const classFamilyIds = useMemo(
    () =>
      new Set(
        classStudents
          .map((s) => s.family_id)
          .filter((id): id is string => id !== null)
      ),
    [classStudents]
  );

  // Count checked-in families for this class
  const checkedInFamilies = useMemo(() => {
    let count = 0;
    for (const fa of familyAttendance) {
      if (classFamilyIds.has(fa.family_id)) count++;
    }
    return count;
  }, [familyAttendance, classFamilyIds]);

  // Count checked-in students for this class
  const classStudentIds = useMemo(
    () => new Set(classStudents.map((s) => s.id)),
    [classStudents]
  );
  const checkedInStudents = useMemo(() => {
    let count = 0;
    for (const sa of studentAttendance) {
      if (classStudentIds.has(sa.student_id)) count++;
    }
    return count;
  }, [studentAttendance, classStudentIds]);

  // Pie chart data — simple 2 slices: checked-in vs not
  const familyPieData = useMemo(() => {
    if (!ongoingEvent?.track_family) return null;
    const total = classFamilyIds.size;
    const notCheckedIn = total - checkedInFamilies;
    if (total === 0) return null;
    return [
      { status: "checkedIn", count: checkedInFamilies, fill: CHECKED_IN_COLOR },
      { status: "notCheckedIn", count: Math.max(0, notCheckedIn), fill: NOT_CHECKED_IN_COLOR },
    ];
  }, [ongoingEvent?.track_family, classFamilyIds.size, checkedInFamilies]);

  const studentPieData = useMemo(() => {
    if (!ongoingEvent?.track_student) return null;
    const total = classStudents.length;
    const notCheckedIn = total - checkedInStudents;
    if (total === 0) return null;
    return [
      { status: "checkedIn", count: checkedInStudents, fill: CHECKED_IN_COLOR },
      { status: "notCheckedIn", count: Math.max(0, notCheckedIn), fill: NOT_CHECKED_IN_COLOR },
    ];
  }, [ongoingEvent?.track_student, classStudents.length, checkedInStudents]);

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetchData() {
      const supabase = createClient();

      const [ongoingResult, studentsResult, eventCountResult] =
        await Promise.all([
          // Ongoing/upcoming event
          supabase
            .from("events")
            .select("*")
            .gte("date", new Date().toISOString().split("T")[0])
            .order("date", { ascending: true })
            .limit(1)
            .maybeSingle(),
          // Students in this class
          supabase
            .from("students")
            .select("id, class_name, family_id")
            .eq("class_name", teacher!.class_name!),
          // Total events relevant to this class
          supabase
            .from("events")
            .select("id, included_classes"),
        ]);

      if (cancelled) return;

      const studentsData = studentsResult.data ?? [];
      setClassStudents(studentsData);
      setTotalStudents(studentsData.length);

      const uniqueFamilies = new Set(
        studentsData.map((s) => s.family_id).filter(Boolean)
      );
      setTotalFamilies(uniqueFamilies.size);

      // Filter events to those including this class
      const allEvents = eventCountResult.data ?? [];
      const relevantEvents = allEvents.filter(
        (e) =>
          !e.included_classes ||
          e.included_classes.includes(teacher!.class_name!)
      );
      setTotalEvents(relevantEvents.length);

      // Set ongoing event (only if it includes this class)
      if (ongoingResult.data) {
        const evt = ongoingResult.data;
        if (!evt.included_classes || evt.included_classes.includes(teacher!.class_name!)) {
          setOngoingEvent(evt);
        }
      }

      setLoading(false);
    }

    fetchData();
    return () => {
      cancelled = true;
    };
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

  const familyRate =
    classFamilyIds.size > 0
      ? Math.round((checkedInFamilies / classFamilyIds.size) * 100)
      : 0;
  const studentRate =
    classStudents.length > 0
      ? Math.round((checkedInStudents / classStudents.length) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          {teacher.class_name} 班
        </p>
      </div>

      {/* Section 1: Class Stats */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">班级概览</h2>
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                学生人数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{totalStudents}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                家庭数量
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{totalFamilies}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                相关活动
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{totalEvents}</span>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2: Active Event */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">当前活动</h2>
            {ongoingEvent && (
              <p className="text-sm text-muted-foreground">{ongoingEvent.name}</p>
            )}
          </div>
          {ongoingEvent && (
            <Button render={<Link href={`/attendance/${ongoingEvent.id}`} />}>
              进入签到
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          )}
        </div>

        {ongoingEvent ? (
          <Card>
            <CardContent className="space-y-6 pt-6">
              {attendanceLoading ? (
                <div className="flex h-24 items-center justify-center" role="status" aria-label="加载出席数据">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {ongoingEvent.track_family && familyPieData && (
                    <Card>
                      <CardHeader className="items-center pb-0">
                        <CardTitle className="text-sm">家庭出席率</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 pb-0">
                        <ChartContainer
                          config={pieChartConfig}
                          className="mx-auto aspect-square max-h-[280px] [&_.recharts-pie-label-text]:fill-foreground"
                        >
                          <PieChart>
                            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                            <Pie data={familyPieData} dataKey="count" label={{ fontSize: 12 }} nameKey="status" outerRadius="70%" />
                          </PieChart>
                        </ChartContainer>
                      </CardContent>
                      <div className="p-4 pt-2 text-center">
                        <p className="text-2xl font-bold">{familyRate}%</p>
                        <p className="text-xs text-muted-foreground">
                          {checkedInFamilies}/{classFamilyIds.size} 家庭已签到
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
                          className="mx-auto aspect-square max-h-[280px] [&_.recharts-pie-label-text]:fill-foreground"
                        >
                          <PieChart>
                            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                            <Pie data={studentPieData} dataKey="count" label={{ fontSize: 12 }} nameKey="status" outerRadius="70%" />
                          </PieChart>
                        </ChartContainer>
                      </CardContent>
                      <div className="p-4 pt-2 text-center">
                        <p className="text-2xl font-bold">{studentRate}%</p>
                        <p className="text-xs text-muted-foreground">
                          {checkedInStudents}/{classStudents.length} 学生已签到
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <Calendar className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">当前没有进行中的活动</p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
