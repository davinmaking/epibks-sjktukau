"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASS_NAMES, CLASS_YEAR_MAP } from "@/lib/constants";
import type { Tables } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown } from "lucide-react";

type Event = Tables<"events">;
type Student = Tables<"students">;
type FamilyAttendance = Tables<"family_attendance">;
type StudentAttendance = Tables<"student_attendance">;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function rateString(checked: number, total: number): string {
  if (total === 0) return "0/0 (0%)";
  const pct = Math.round((checked / total) * 100);
  return `${checked}/${total} (${pct}%)`;
}

function ratePercent(checked: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((checked / total) * 100);
}

function rateRowColor(checked: number, total: number): string {
  const pct = ratePercent(checked, total);
  if (pct >= 75) return "bg-green-50 dark:bg-green-950/20";
  if (pct >= 50) return "bg-yellow-50 dark:bg-yellow-950/20";
  return "bg-red-50 dark:bg-red-950/20";
}

function rateCellColor(checked: number, total: number): string {
  const pct = ratePercent(checked, total);
  if (pct >= 75) return "text-green-700 dark:text-green-400";
  if (pct >= 50) return "text-yellow-700 dark:text-yellow-400";
  return "text-red-700 dark:text-red-400";
}

export default function ReportsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [familyAttendance, setFamilyAttendance] = useState<FamilyAttendance[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendance[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  // All events summary for Tab 3
  const [allEventsData, setAllEventsData] = useState<
    {
      event: Event;
      familyChecked: number;
      familyTotal: number;
      studentChecked: number;
      studentTotal: number;
    }[]
  >([]);
  const [loadingAllEvents, setLoadingAllEvents] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId),
    [events, selectedEventId]
  );

  // Fetch events on mount
  useEffect(() => {
    async function fetchEvents() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: false });

      if (error) {
        console.error("Failed to fetch events:", error);
      } else {
        const eventList = data ?? [];
        setEvents(eventList);
        if (eventList.length > 0) {
          setSelectedEventId(eventList[0].id);
        }
      }
      setLoadingEvents(false);
    }
    fetchEvents();
  }, []);

  // Fetch event-specific data when selected event changes
  useEffect(() => {
    if (!selectedEventId) return;

    async function fetchEventData() {
      setLoadingData(true);
      const supabase = createClient();

      const [studentsRes, familyRes, studentAttRes] = await Promise.all([
        supabase.from("students").select("*"),
        supabase
          .from("family_attendance")
          .select("*")
          .eq("event_id", selectedEventId),
        supabase
          .from("student_attendance")
          .select("*")
          .eq("event_id", selectedEventId),
      ]);

      if (studentsRes.error) console.error("Failed to fetch students:", studentsRes.error);
      if (familyRes.error) console.error("Failed to fetch family attendance:", familyRes.error);
      if (studentAttRes.error) console.error("Failed to fetch student attendance:", studentAttRes.error);

      setStudents(studentsRes.data ?? []);
      setFamilyAttendance(familyRes.data ?? []);
      setStudentAttendance(studentAttRes.data ?? []);
      setLoadingData(false);
    }
    fetchEventData();
  }, [selectedEventId]);

  // Fetch all events summary data for Tab 3
  const fetchAllEventsSummary = useCallback(async () => {
    setLoadingAllEvents(true);
    const supabase = createClient();

    // Get last 10 events
    const recentEvents = events.slice(0, 10);

    // Get all students for total counts
    const { data: allStudents } = await supabase.from("students").select("*");
    const studentList = allStudents ?? [];
    const totalStudents = studentList.length;
    const totalFamilies = new Set(
      studentList.filter((s) => s.family_id).map((s) => s.family_id)
    ).size;

    const summaries = await Promise.all(
      recentEvents.map(async (event) => {
        const [familyRes, studentAttRes] = await Promise.all([
          supabase
            .from("family_attendance")
            .select("family_id")
            .eq("event_id", event.id),
          supabase
            .from("student_attendance")
            .select("student_id")
            .eq("event_id", event.id),
        ]);

        const familyChecked = new Set(
          (familyRes.data ?? []).map((r) => r.family_id)
        ).size;
        const studentChecked = new Set(
          (studentAttRes.data ?? []).map((r) => r.student_id)
        ).size;

        return {
          event,
          familyChecked,
          familyTotal: totalFamilies,
          studentChecked,
          studentTotal: totalStudents,
        };
      })
    );

    setAllEventsData(summaries);
    setLoadingAllEvents(false);
  }, [events]);

  // Class-level stats (memoized)
  const classStats = useMemo(() => {
    if (!selectedEvent) return [];

    return CLASS_NAMES.map((className) => {
      const classStudents = students.filter((s) => s.class_name === className);
      const totalStudents = classStudents.length;
      const totalFamilies = new Set(
        classStudents.filter((s) => s.family_id).map((s) => s.family_id)
      ).size;

      const checkedFamilies = familyAttendance.filter(
        (fa) => fa.class_name === className
      ).length;

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
  }, [selectedEvent, students, familyAttendance, studentAttendance]);

  // Overall totals
  const overallTotals = useMemo(() => {
    return classStats.reduce(
      (acc, row) => ({
        totalStudents: acc.totalStudents + row.totalStudents,
        totalFamilies: acc.totalFamilies + row.totalFamilies,
        checkedFamilies: acc.checkedFamilies + row.checkedFamilies,
        checkedStudents: acc.checkedStudents + row.checkedStudents,
      }),
      { totalStudents: 0, totalFamilies: 0, checkedFamilies: 0, checkedStudents: 0 }
    );
  }, [classStats]);

  // Year-level stats (memoized)
  const yearStats = useMemo(() => {
    if (!selectedEvent) return [];

    const yearLevels = [...new Set(Object.values(CLASS_YEAR_MAP))];

    return yearLevels.map((yearLevel) => {
      const classesInYear = Object.entries(CLASS_YEAR_MAP)
        .filter(([, yl]) => yl === yearLevel)
        .map(([cn]) => cn);

      const yearStudents = students.filter((s) => classesInYear.includes(s.class_name));
      const totalStudents = yearStudents.length;
      const totalFamilies = new Set(
        yearStudents.filter((s) => s.family_id).map((s) => s.family_id)
      ).size;

      const checkedFamilies = familyAttendance.filter((fa) =>
        classesInYear.includes(fa.class_name)
      ).length;

      const yearStudentIds = new Set(yearStudents.map((s) => s.id));
      const checkedStudents = studentAttendance.filter((sa) =>
        yearStudentIds.has(sa.student_id)
      ).length;

      return {
        yearLevel,
        totalStudents,
        totalFamilies,
        checkedFamilies,
        checkedStudents,
      };
    });
  }, [selectedEvent, students, familyAttendance, studentAttendance]);

  if (loadingEvents) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">报告</h1>
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <p className="text-lg font-medium">暂无活动数据</p>
          <p className="text-sm">请先创建活动并记录出席情况</p>
        </div>
      </div>
    );
  }

  const showFamily = selectedEvent?.track_family ?? false;
  const showStudent = selectedEvent?.track_student ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">报告</h1>
        <Button disabled title="即将推出">
          <FileDown className="size-4" />
          导出
        </Button>
      </div>

      {/* Event Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">选择活动:</label>
        <Select
          value={selectedEventId}
          onValueChange={(v) => setSelectedEventId(v ?? "")}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="选择活动" />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name} ({formatDate(event.date)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="class"
        onValueChange={(v) => {
          if (v === "all" && allEventsData.length === 0) {
            fetchAllEventsSummary();
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="class">按班级</TabsTrigger>
          <TabsTrigger value="year">按年级</TabsTrigger>
          <TabsTrigger value="all">所有活动</TabsTrigger>
        </TabsList>

        {/* Tab 1: By Class */}
        <TabsContent value="class">
          {loadingData ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !showFamily && !showStudent ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <p>该活动未追踪家庭或学生出席</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">班级</th>
                    {showFamily && (
                      <th className="px-4 py-3 text-left font-medium">家庭出席率</th>
                    )}
                    {showStudent && (
                      <th className="px-4 py-3 text-left font-medium">学生出席率</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {classStats.map((row) => {
                    // Determine row color based on the primary tracked metric
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
                        <td className="px-4 py-2.5 font-medium">{row.className}</td>
                        {showFamily && (
                          <td
                            className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedFamilies, row.totalFamilies)}`}
                          >
                            {rateString(row.checkedFamilies, row.totalFamilies)}
                          </td>
                        )}
                        {showStudent && (
                          <td
                            className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedStudents, row.totalStudents)}`}
                          >
                            {rateString(row.checkedStudents, row.totalStudents)}
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

        {/* Tab 2: By Year Level */}
        <TabsContent value="year">
          {loadingData ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !showFamily && !showStudent ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <p>该活动未追踪家庭或学生出席</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">年级</th>
                    {showFamily && (
                      <th className="px-4 py-3 text-left font-medium">家庭出席率</th>
                    )}
                    {showStudent && (
                      <th className="px-4 py-3 text-left font-medium">学生出席率</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {yearStats.map((row) => {
                    const primaryChecked = showFamily
                      ? row.checkedFamilies
                      : row.checkedStudents;
                    const primaryTotal = showFamily
                      ? row.totalFamilies
                      : row.totalStudents;

                    return (
                      <tr
                        key={row.yearLevel}
                        className={`border-b ${rateRowColor(primaryChecked, primaryTotal)}`}
                      >
                        <td className="px-4 py-2.5 font-medium">{row.yearLevel}</td>
                        {showFamily && (
                          <td
                            className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedFamilies, row.totalFamilies)}`}
                          >
                            {rateString(row.checkedFamilies, row.totalFamilies)}
                          </td>
                        )}
                        {showStudent && (
                          <td
                            className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedStudents, row.totalStudents)}`}
                          >
                            {rateString(row.checkedStudents, row.totalStudents)}
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

        {/* Tab 3: All Events Comparison */}
        <TabsContent value="all">
          {loadingAllEvents ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : allEventsData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <p>暂无数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">日期</th>
                    <th className="px-4 py-3 text-left font-medium">活动名称</th>
                    <th className="px-4 py-3 text-left font-medium">家庭出席率</th>
                    <th className="px-4 py-3 text-left font-medium">学生出席率</th>
                  </tr>
                </thead>
                <tbody>
                  {allEventsData.map(
                    ({ event, familyChecked, familyTotal, studentChecked, studentTotal }) => (
                      <tr key={event.id} className="border-b">
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {formatDate(event.date)}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{event.name}</td>
                        <td
                          className={`px-4 py-2.5 font-mono ${
                            event.track_family
                              ? rateCellColor(familyChecked, familyTotal)
                              : "text-muted-foreground"
                          }`}
                        >
                          {event.track_family
                            ? rateString(familyChecked, familyTotal)
                            : "-"}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-mono ${
                            event.track_student
                              ? rateCellColor(studentChecked, studentTotal)
                              : "text-muted-foreground"
                          }`}
                        >
                          {event.track_student
                            ? rateString(studentChecked, studentTotal)
                            : "-"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
