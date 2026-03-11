"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pie, PieChart } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { useAttendanceStats } from "@/hooks/use-attendance-stats";
import { AttendanceStatsCard } from "@/components/attendance-stats-card";
import { ClassProgressBar } from "@/components/class-progress-bar";
import { CLASS_NAMES, CLASS_COLORS, NOT_CHECKED_IN_COLOR } from "@/lib/constants";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CalendarDays,
  FileDown,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";
import { formatDateWithWeekday, getStatusColors } from "@/lib/utils";

// CLASS_COLORS and NOT_CHECKED_IN_COLOR imported from constants

interface AttendeeEntry {
  type: string;
  name: string;
  ic: string;
  relationship: string;
}

interface StudentRow {
  id: string;
  name: string;
  class_name: string;
  family_id: string | null;
}

type Event = Tables<"events">;

function rateString(checked: number, total: number): string {
  if (total === 0) return "0% (0/0)";
  const pct = Math.round((checked / total) * 100);
  return `${pct}% (${checked}/${total})`;
}

function ratePercent(checked: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((checked / total) * 100);
}

function rateRowColor(checked: number, total: number): string {
  const colors = getStatusColors(ratePercent(checked, total));
  return `${colors.bg} ${colors.bgDark}`;
}

function rateCellColor(checked: number, total: number): string {
  const colors = getStatusColors(ratePercent(checked, total));
  return `${colors.text} ${colors.textDark}`;
}


export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Realtime attendance data
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(eventId);

  // Filter students by included classes (null = all classes)
  const includedStudents = useMemo(
    () =>
      event?.included_classes
        ? students.filter((s) =>
            event.included_classes!.includes(s.class_name)
          )
        : students,
    [event, students]
  );

  // Attendance stats
  const { classStats, overallStats } = useAttendanceStats({
    familyAttendance,
    studentAttendance,
    students: includedStudents,
  });

  // Map family_id -> children names (for showing in detail view)
  const familyChildrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of includedStudents) {
      if (s.family_id) {
        if (!map.has(s.family_id)) {
          map.set(s.family_id, []);
        }
        map.get(s.family_id)!.push(s.name);
      }
    }
    return map;
  }, [includedStudents]);

  // Set of checked-in family_ids
  const allCheckedInFamilyIds = useMemo(
    () => new Set(familyAttendance.map((fa) => fa.family_id)),
    [familyAttendance]
  );

  // Included class names
  const includedClassNames = useMemo(
    () => (event?.included_classes ?? CLASS_NAMES) as string[],
    [event]
  );

  // Pie chart data: one slice per class + "未签到"
  const familyPieData = useMemo(() => {
    if (!event?.track_family || classStats.length === 0) return null;
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
    const notCheckedIn = overallStats.classLevelTotalFamilies - overallStats.classLevelCheckedInFamilies;
    if (notCheckedIn > 0) {
      slices.push({ className: "notCheckedIn", count: notCheckedIn, fill: NOT_CHECKED_IN_COLOR });
    }
    return slices;
  }, [event?.track_family, classStats, overallStats.classLevelCheckedInFamilies, overallStats.classLevelTotalFamilies]);

  const studentPieData = useMemo(() => {
    if (!event?.track_student || classStats.length === 0) return null;
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
      slices.push({ className: "notCheckedIn", count: notCheckedIn, fill: NOT_CHECKED_IN_COLOR });
    }
    return slices;
  }, [event?.track_student, classStats, overallStats.checkedInStudents, overallStats.totalStudents]);

  const pieChartConfig = useMemo(() => {
    const config: ChartConfig = { count: { label: "人数" } };
    for (const cls of CLASS_NAMES) {
      config[cls] = { label: cls, color: CLASS_COLORS[cls] ?? "var(--chart-1)" };
    }
    config.notCheckedIn = { label: "未签到", color: NOT_CHECKED_IN_COLOR };
    return config;
  }, []);

  // Class-level stats for report table (same logic as old reports page)
  const classReportStats = useMemo(() => {
    if (!event) return [];

    return includedClassNames.map((className) => {
      const classStudents = includedStudents.filter(
        (s) => s.class_name === className
      );
      const totalStudents = classStudents.length;
      const totalFamilies = totalStudents;

      let checkedFamilies = 0;
      for (const s of classStudents) {
        if (s.family_id && allCheckedInFamilyIds.has(s.family_id)) {
          checkedFamilies++;
        }
      }

      const classStudentIds = new Set(classStudents.map((s) => s.id));
      const checkedStudents = studentAttendance.filter((sa) =>
        classStudentIds.has(sa.student_id)
      ).length;

      return {
        className,
        totalStudents,
        totalFamilies,
        checkedFamilies,
        checkedStudents,
      };
    });
  }, [
    event,
    includedClassNames,
    includedStudents,
    allCheckedInFamilyIds,
    studentAttendance,
  ]);

  // Overall totals for report table
  const overallTotals = useMemo(() => {
    return classReportStats.reduce(
      (acc, row) => ({
        totalStudents: acc.totalStudents + row.totalStudents,
        totalFamilies: acc.totalFamilies + row.totalFamilies,
        checkedFamilies: acc.checkedFamilies + row.checkedFamilies,
        checkedStudents: acc.checkedStudents + row.checkedStudents,
      }),
      {
        totalStudents: 0,
        totalFamilies: 0,
        checkedFamilies: 0,
        checkedStudents: 0,
      }
    );
  }, [classReportStats]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const [eventResult, studentsResult] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId).single(),
        supabase
          .from("students")
          .select("id, name, class_name, family_id")
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
    setDeleteDialogOpen(false);
    setDeleting(true);
    const supabase = createClient();

    const [familyDelResult, studentDelResult] = await Promise.all([
      supabase.from("family_attendance").delete().eq("event_id", event.id),
      supabase.from("student_attendance").delete().eq("event_id", event.id),
    ]);

    if (familyDelResult.error || studentDelResult.error) {
      console.error(
        "Failed to delete attendance records:",
        familyDelResult.error,
        studentDelResult.error
      );
      toast.error("删除签到记录失败，请重试");
      setDeleting(false);
      return;
    }

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (error) {
      console.error("Failed to delete event:", error);
      toast.error("删除失败，请重试");
      setDeleting(false);
    } else {
      toast.success(`活动「${event.name}」已删除`);
      router.push("/events");
    }
  }

  // CSV export — only checked-in families with students, guardians, ICs, class
  function handleExportDetailCSV() {
    if (!event) return;

    const headers = ["班级", "学生姓名", "出席者姓名", "身份证号码", "关系"];
    const rows: string[][] = [];

    for (const className of includedClassNames) {
      const classStudents = includedStudents.filter(
        (s) => s.class_name === className
      );

      for (const student of classStudents) {
        if (!student.family_id) continue;

        const record = familyAttendance.find(
          (fa) => fa.family_id === student.family_id
        );
        if (!record) continue;

        const attendees =
          (record.attendees as unknown as AttendeeEntry[]) ?? [];

        if (attendees.length > 0) {
          for (const att of attendees) {
            rows.push([
              className,
              student.name,
              att.name || "-",
              att.ic || "-",
              att.relationship || att.type || "-",
            ]);
          }
        } else {
          rows.push([
            className,
            student.name,
            record.attendee_name || "-",
            record.attendee_ic || "-",
            record.attendee_relationship || record.attendee_type || "-",
          ]);
        }
      }
    }

    const escapeCsv = (s: string) =>
      s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    const csv =
      "\uFEFF" +
      [headers, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.name}-出席详情.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // CSV export — class-level summary
  function handleExportSummaryCSV() {
    if (!event || classReportStats.length === 0) return;

    const headers = ["班级"];
    if (showFamily) headers.push("出席人数", "总人数", "出席率");
    if (showStudent) headers.push("学生已签到", "学生总数", "学生出席率");

    const rows = classReportStats.map((row) => {
      const cells: string[] = [row.className];
      if (showFamily) {
        cells.push(
          String(row.checkedFamilies),
          String(row.totalFamilies),
          `${ratePercent(row.checkedFamilies, row.totalFamilies)}%`
        );
      }
      if (showStudent) {
        cells.push(
          String(row.checkedStudents),
          String(row.totalStudents),
          `${ratePercent(row.checkedStudents, row.totalStudents)}%`
        );
      }
      return cells;
    });

    const csv =
      "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.name}-按班级报告.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div
        className="flex h-64 items-center justify-center"
        role="status"
        aria-label="加载中"
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) return null;

  const showFamily = event.track_family;
  const showStudent = event.track_student;

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
            <p className="text-sm text-muted-foreground">
              {event.description}
            </p>
          )}
          {event.included_classes && (
            <p className="text-xs text-muted-foreground">
              此活动包含 {event.included_classes.length}/{CLASS_NAMES.length}{" "}
              个班级
            </p>
          )}
        </div>

        {/* Delete button */}
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2
              className="size-4 animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <Trash2 className="size-4" data-icon="inline-start" />
          )}
          删除活动
        </Button>
      </div>

      <Separator />

      {/* Loading attendance */}
      {attendanceLoading ? (
        <div
          className="flex h-32 items-center justify-center"
          role="status"
          aria-label="加载出席数据"
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="report">班级报告</TabsTrigger>
            <TabsTrigger value="detail">出席详情</TabsTrigger>
          </TabsList>

          {/* Tab 1: Overview */}
          <TabsContent value="overview" className="space-y-6">
            {/* Overall stats cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {showFamily && (
                <AttendanceStatsCard
                  title="总出席率"
                  value={`${overallStats.classLevelCheckedInFamilies}/${overallStats.classLevelTotalFamilies}`}
                  percentage={Math.round(
                    overallStats.classLevelFamilyRate * 100
                  )}
                  description={`按班级累计 · 唯一家庭 ${overallStats.checkedInFamilies}/${overallStats.totalFamilies}`}
                />
              )}
              {showStudent && (
                <AttendanceStatsCard
                  title="学生出席率"
                  value={`${overallStats.checkedInStudents}/${overallStats.totalStudents}`}
                  percentage={Math.round(overallStats.studentRate * 100)}
                  description="已签到学生 / 总学生数"
                />
              )}
            </div>

            {/* Pie charts */}
            <div className="grid gap-4 sm:grid-cols-2">
              {showFamily && familyPieData && (
                <Card>
                  <CardHeader className="items-center pb-0">
                    <CardTitle className="text-sm">总出席率</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 pb-0">
                    <ChartContainer
                      config={pieChartConfig}
                      className="mx-auto aspect-square max-h-[280px] [&_.recharts-pie-label-text]:fill-foreground"
                    >
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Pie data={familyPieData} dataKey="count" label={{ fontSize: 12 }} nameKey="className" outerRadius="70%" />
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
              {showStudent && studentPieData && (
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
                        <Pie data={studentPieData} dataKey="count" label={{ fontSize: 12 }} nameKey="className" outerRadius="70%" />
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

            {/* Per-class progress bars */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">各班出席情况</h2>
              {includedClassNames.map((cls) => {
                const stat = classStats.find((s) => s.className === cls);
                if (!stat) return null;

                const checkedIn = showFamily
                  ? stat.checkedInFamilies
                  : stat.checkedInStudents;
                const total = showFamily
                  ? stat.totalFamilies
                  : stat.totalStudents;

                if (!showFamily && !showStudent) return null;

                return (
                  <ClassProgressBar
                    key={cls}
                    classLabel={cls}
                    checkedIn={checkedIn}
                    total={total}
                    colorDot={CLASS_COLORS[cls]}
                  />
                );
              })}
            </div>
          </TabsContent>

          {/* Tab 2: Class Report Table */}
          <TabsContent value="report" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">班级报告</h2>
              <Button size="sm" onClick={handleExportSummaryCSV}>
                <FileDown className="size-4" />
                导出 CSV
              </Button>
            </div>

            {!showFamily && !showStudent ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <p>该活动未追踪家庭或学生出席</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">各班级出席率报告</caption>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th
                        scope="col"
                        className="px-4 py-3 text-left font-medium"
                      >
                        班级
                      </th>
                      {showFamily && (
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium"
                        >
                          总出席率
                        </th>
                      )}
                      {showStudent && (
                        <th
                          scope="col"
                          className="px-4 py-3 text-left font-medium"
                        >
                          学生出席率
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {classReportStats.map((row) => {
                      const primaryChecked = showFamily
                        ? row.checkedFamilies
                        : row.checkedStudents;
                      const primaryTotal = showFamily
                        ? row.totalFamilies
                        : row.totalStudents;

                      return (
                        <tr
                          key={row.className}
                          className={`border-b ${rateRowColor(primaryChecked, primaryTotal)}`}
                        >
                          <td className="px-4 py-2.5 font-medium">
                            {row.className}
                          </td>
                          {showFamily && (
                            <td
                              className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedFamilies, row.totalFamilies)}`}
                            >
                              {rateString(
                                row.checkedFamilies,
                                row.totalFamilies
                              )}
                            </td>
                          )}
                          {showStudent && (
                            <td
                              className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedStudents, row.totalStudents)}`}
                            >
                              {rateString(
                                row.checkedStudents,
                                row.totalStudents
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {/* Summary row */}
                    <tr className="border-t-2 bg-muted/30 font-bold">
                      <td className="px-4 py-2.5">总计</td>
                      {showFamily && (
                        <td className="px-4 py-2.5 font-mono">
                          {rateString(
                            overallTotals.checkedFamilies,
                            overallTotals.totalFamilies
                          )}
                        </td>
                      )}
                      {showStudent && (
                        <td className="px-4 py-2.5 font-mono">
                          {rateString(
                            overallTotals.checkedStudents,
                            overallTotals.totalStudents
                          )}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Detailed Attendance */}
          <TabsContent value="detail" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">出席详情</h2>
              <Button size="sm" onClick={handleExportDetailCSV}>
                <FileDown className="size-4" />
                导出 CSV
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              各班出席家长/监护人详情，含学生姓名
            </p>

            {!showFamily ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <p>该活动未追踪家庭出席</p>
              </div>
            ) : (
              <div className="space-y-6">
                {includedClassNames.map((className) => {
                  const classStudents = includedStudents.filter(
                    (s) => s.class_name === className
                  );
                  const classRecords = familyAttendance.filter(
                    (fa) => fa.class_name === className
                  );
                  // Sibling sync
                  const classFamilyIds = new Set(
                    classStudents
                      .filter((s) => s.family_id)
                      .map((s) => s.family_id!)
                  );
                  const siblingRecords = familyAttendance.filter(
                    (fa) =>
                      fa.class_name !== className &&
                      classFamilyIds.has(fa.family_id)
                  );
                  const allRecords = [...classRecords, ...siblingRecords];

                  return (
                    <div key={className}>
                      <h3 className="mb-2 text-sm font-semibold">
                        {className}
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({allRecords.length > 0
                            ? `${allRecords.length} 条记录`
                            : "暂无签到"})
                        </span>
                      </h3>
                      {allRecords.length === 0 ? (
                        <p className="text-xs text-muted-foreground pb-2">
                          暂无签到记录
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full table-fixed text-xs">
                            <colgroup>
                              <col className="w-[36px]" />
                              <col className="w-[18%]" />
                              <col className="w-[28%]" />
                              <col className="w-[22%]" />
                              <col className="w-[14%]" />
                              <col className="w-[14%]" />
                            </colgroup>
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="whitespace-nowrap px-3 py-2 text-left font-medium">
                                  #
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  学生
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  出席者姓名
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  身份证号码
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  关系
                                </th>
                                <th className="px-3 py-2 text-left font-medium">
                                  签到来源
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                let rowNum = 0;
                                return allRecords.flatMap((record) => {
                                  const attendees =
                                    (record.attendees as unknown as AttendeeEntry[]) ??
                                    [];
                                  const isSibling =
                                    record.class_name !== className;
                                  const source = isSibling
                                    ? record.class_name
                                    : "本班";
                                  const children =
                                    familyChildrenMap
                                      .get(record.family_id)
                                      ?.filter((name) =>
                                        classStudents.some(
                                          (s) =>
                                            s.name === name &&
                                            s.family_id === record.family_id
                                        )
                                      )
                                      ?.join("、") ?? "-";

                                  if (attendees.length > 0) {
                                    return attendees.map((att, i) => {
                                      rowNum++;
                                      return (
                                        <tr
                                          key={`${record.id}-${i}`}
                                          className="border-b"
                                        >
                                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                            {rowNum}
                                          </td>
                                          <td className="truncate px-3 py-2" title={i === 0 ? children : ""}>
                                            {i === 0 ? children : ""}
                                          </td>
                                          <td className="truncate px-3 py-2 font-medium" title={att.name || "-"}>
                                            {att.name || "-"}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 font-mono">
                                            {att.ic || "-"}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2">
                                            {att.relationship ||
                                              att.type ||
                                              "-"}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2">
                                            {isSibling ? (
                                              <span className="text-chart-2">
                                                {source}
                                              </span>
                                            ) : (
                                              source
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    });
                                  }

                                  rowNum++;
                                  return [
                                    <tr
                                      key={record.id}
                                      className="border-b"
                                    >
                                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                        {rowNum}
                                      </td>
                                      <td className="truncate px-3 py-2" title={children}>
                                        {children}
                                      </td>
                                      <td className="truncate px-3 py-2 font-medium" title={record.attendee_name || "-"}>
                                        {record.attendee_name || "-"}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 font-mono">
                                        {record.attendee_ic || "-"}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2">
                                        {record.attendee_relationship ||
                                          record.attendee_type ||
                                          "-"}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2">
                                        {isSibling ? (
                                          <span className="text-chart-2">
                                            {source}
                                          </span>
                                        ) : (
                                          source
                                        )}
                                      </td>
                                    </tr>,
                                  ];
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除活动</DialogTitle>
            <DialogDescription>
              确认删除活动「{event?.name}」？此操作不可撤销，所有签到记录也将被删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
