"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASS_NAMES, CLASS_YEAR_MAP } from "@/lib/constants";
import type { Tables } from "@/lib/types";
import { formatDateShort, getStatusColors } from "@/lib/utils";
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
  const colors = getStatusColors(ratePercent(checked, total));
  return `${colors.bg} ${colors.bgDark}`;
}

function rateCellColor(checked: number, total: number): string {
  const colors = getStatusColors(ratePercent(checked, total));
  return `${colors.text} ${colors.textDark}`;
}

function rateLabel(checked: number, total: number): string {
  return getStatusColors(ratePercent(checked, total)).label;
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

  // Fetch events and students on mount (students cached, not re-fetched per event)
  useEffect(() => {
    async function fetchInitialData() {
      const supabase = createClient();
      const [eventsRes, studentsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .order("date", { ascending: false }),
        supabase.from("students").select("*"),
      ]);

      if (eventsRes.error) {
        console.error("Failed to fetch events:", eventsRes.error);
      } else {
        const eventList = eventsRes.data ?? [];
        setEvents(eventList);
        if (eventList.length > 0) {
          setSelectedEventId(eventList[0].id);
        }
      }

      if (studentsRes.error) {
        console.error("Failed to fetch students:", studentsRes.error);
      } else {
        setStudents(studentsRes.data ?? []);
      }

      setLoadingEvents(false);
    }
    fetchInitialData();
  }, []);

  // Fetch attendance data when selected event changes (students already cached)
  useEffect(() => {
    if (!selectedEventId) return;

    async function fetchEventAttendance() {
      setLoadingData(true);
      const supabase = createClient();

      const [familyRes, studentAttRes] = await Promise.all([
        supabase
          .from("family_attendance")
          .select("*")
          .eq("event_id", selectedEventId),
        supabase
          .from("student_attendance")
          .select("*")
          .eq("event_id", selectedEventId),
      ]);

      if (familyRes.error) console.error("Failed to fetch family attendance:", familyRes.error);
      if (studentAttRes.error) console.error("Failed to fetch student attendance:", studentAttRes.error);

      setFamilyAttendance(familyRes.data ?? []);
      setStudentAttendance(studentAttRes.data ?? []);
      setLoadingData(false);
    }
    fetchEventAttendance();
  }, [selectedEventId]);

  // Fetch all events summary data for Tab 3
  const fetchAllEventsSummary = useCallback(async () => {
    setLoadingAllEvents(true);
    const supabase = createClient();

    const recentEvents = events.slice(0, 10);
    const eventIds = recentEvents.map((e) => e.id);

    // Batch: fetch students + all attendance in 3 queries (not N+1)
    const [studentsRes, familyAttRes, studentAttRes] = await Promise.all([
      supabase.from("students").select("*"),
      supabase
        .from("family_attendance")
        .select("event_id, family_id")
        .in("event_id", eventIds),
      supabase
        .from("student_attendance")
        .select("event_id, student_id")
        .in("event_id", eventIds),
    ]);

    const studentList = studentsRes.data ?? [];

    // Group attendance by event_id
    const familyByEvent = new Map<string, Set<string>>();
    for (const fa of familyAttRes.data ?? []) {
      if (!familyByEvent.has(fa.event_id)) {
        familyByEvent.set(fa.event_id, new Set());
      }
      familyByEvent.get(fa.event_id)!.add(fa.family_id);
    }

    const studentByEvent = new Map<string, Set<string>>();
    for (const sa of studentAttRes.data ?? []) {
      if (!studentByEvent.has(sa.event_id)) {
        studentByEvent.set(sa.event_id, new Set());
      }
      studentByEvent.get(sa.event_id)!.add(sa.student_id);
    }

    const summaries = recentEvents.map((event) => {
      // Filter students by event's included_classes
      const eventStudents = event.included_classes
        ? studentList.filter((s) => event.included_classes!.includes(s.class_name))
        : studentList;
      const totalStudents = eventStudents.length;
      const totalFamilies = new Set(
        eventStudents.filter((s) => s.family_id).map((s) => s.family_id)
      ).size;

      return {
        event,
        familyChecked: familyByEvent.get(event.id)?.size ?? 0,
        familyTotal: totalFamilies,
        studentChecked: studentByEvent.get(event.id)?.size ?? 0,
        studentTotal: totalStudents,
      };
    });

    setAllEventsData(summaries);
    setLoadingAllEvents(false);
  }, [events]);

  // Classes included in the selected event (null = all)
  const includedClassNames = useMemo(() => {
    if (!selectedEvent) return CLASS_NAMES;
    return selectedEvent.included_classes ?? CLASS_NAMES;
  }, [selectedEvent]);

  // Set of all checked-in family_ids for the selected event
  const allCheckedInFamilyIds = useMemo(
    () => new Set(familyAttendance.map((fa) => fa.family_id)),
    [familyAttendance]
  );

  // Class-level stats (memoized)
  const classStats = useMemo(() => {
    if (!selectedEvent) return [];

    return includedClassNames.map((className) => {
      const classStudents = students.filter((s) => s.class_name === className);
      const totalStudents = classStudents.length;
      const classFamilyIds = new Set(
        classStudents.map((s) => s.family_id).filter((id): id is string => id !== null)
      );
      const totalFamilies = classFamilyIds.size;

      // Count families checked in: match by family_id, not class_name
      // This ensures sibling families checked in by another class are counted
      let checkedFamilies = 0;
      for (const fid of classFamilyIds) {
        if (allCheckedInFamilyIds.has(fid)) checkedFamilies++;
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
  }, [selectedEvent, includedClassNames, students, allCheckedInFamilyIds, studentAttendance]);

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

    // Only year levels that have included classes
    const includedSet = new Set(includedClassNames);
    const yearLevels = [...new Set(
      Object.entries(CLASS_YEAR_MAP)
        .filter(([cn]) => includedSet.has(cn))
        .map(([, yl]) => yl)
    )];

    return yearLevels.map((yearLevel) => {
      const classesInYear = Object.entries(CLASS_YEAR_MAP)
        .filter(([cn, yl]) => yl === yearLevel && includedSet.has(cn))
        .map(([cn]) => cn);

      const yearStudents = students.filter((s) => classesInYear.includes(s.class_name));
      const totalStudents = yearStudents.length;
      const yearFamilyIds = new Set(
        yearStudents.map((s) => s.family_id).filter((id): id is string => id !== null)
      );
      const totalFamilies = yearFamilyIds.size;

      // Count by family_id match, not class_name (sibling sync)
      let checkedFamilies = 0;
      for (const fid of yearFamilyIds) {
        if (allCheckedInFamilyIds.has(fid)) checkedFamilies++;
      }

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
  }, [selectedEvent, includedClassNames, students, allCheckedInFamilyIds, familyAttendance, studentAttendance]);

  // CSV export for class-level report
  function handleExportCSV() {
    if (!selectedEvent || classStats.length === 0) return;

    const headers = ["班级"];
    if (showFamily) headers.push("家庭已签到", "家庭总数", "家庭出席率");
    if (showStudent) headers.push("学生已签到", "学生总数", "学生出席率");

    const rows = classStats.map((row) => {
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

    // BOM for Excel Chinese support
    const csv =
      "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedEvent.name}-按班级报告.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loadingEvents) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="加载中">
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
        <Button
          onClick={handleExportCSV}
          disabled={!selectedEvent || classStats.length === 0}
        >
          <FileDown className="size-4" />
          导出 CSV
        </Button>
      </div>

      {/* Event Selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="text-sm font-medium text-muted-foreground">选择活动:</label>
        <Select
          value={selectedEventId}
          onValueChange={(v) => setSelectedEventId(v ?? "")}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="选择活动" />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name} ({formatDateShort(event.date)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="class"
        onValueChange={(v) => {
          if (v === "all") {
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
            <div className="flex h-40 items-center justify-center" role="status" aria-label="加载数据">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !showFamily && !showStudent ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <p>该活动未追踪家庭或学生出席</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">各班级出席率报告</caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="px-4 py-3 text-left font-medium">班级</th>
                    {showFamily && (
                      <th scope="col" className="px-4 py-3 text-left font-medium">家庭出席率</th>
                    )}
                    {showStudent && (
                      <th scope="col" className="px-4 py-3 text-left font-medium">学生出席率</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {classStats.map((row) => {
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
                            {rateString(row.checkedFamilies, row.totalFamilies)}{" "}
                            <span className="font-sans text-xs">
                              {rateLabel(row.checkedFamilies, row.totalFamilies)}
                            </span>
                          </td>
                        )}
                        {showStudent && (
                          <td
                            className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedStudents, row.totalStudents)}`}
                          >
                            {rateString(row.checkedStudents, row.totalStudents)}{" "}
                            <span className="font-sans text-xs">
                              {rateLabel(row.checkedStudents, row.totalStudents)}
                            </span>
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
            <div className="flex h-40 items-center justify-center" role="status" aria-label="加载数据">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !showFamily && !showStudent ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <p>该活动未追踪家庭或学生出席</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">各年级出席率报告</caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="px-4 py-3 text-left font-medium">年级</th>
                    {showFamily && (
                      <th scope="col" className="px-4 py-3 text-left font-medium">家庭出席率</th>
                    )}
                    {showStudent && (
                      <th scope="col" className="px-4 py-3 text-left font-medium">学生出席率</th>
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
                            {rateString(row.checkedFamilies, row.totalFamilies)}{" "}
                            <span className="font-sans text-xs">
                              {rateLabel(row.checkedFamilies, row.totalFamilies)}
                            </span>
                          </td>
                        )}
                        {showStudent && (
                          <td
                            className={`px-4 py-2.5 font-mono ${rateCellColor(row.checkedStudents, row.totalStudents)}`}
                          >
                            {rateString(row.checkedStudents, row.totalStudents)}{" "}
                            <span className="font-sans text-xs">
                              {rateLabel(row.checkedStudents, row.totalStudents)}
                            </span>
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
            <div className="flex h-40 items-center justify-center" role="status" aria-label="加载数据">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : allEventsData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <p>暂无数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">所有活动出席率汇总</caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="px-4 py-3 text-left font-medium">日期</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">活动名称</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">家庭出席率</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">学生出席率</th>
                  </tr>
                </thead>
                <tbody>
                  {allEventsData.map(
                    ({ event, familyChecked, familyTotal, studentChecked, studentTotal }) => (
                      <tr key={event.id} className="border-b">
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {formatDateShort(event.date)}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{event.name}</td>
                        <td
                          className={`px-4 py-2.5 font-mono ${
                            event.track_family
                              ? rateCellColor(familyChecked, familyTotal)
                              : "text-muted-foreground"
                          }`}
                        >
                          {event.track_family ? (
                            <>
                              {rateString(familyChecked, familyTotal)}{" "}
                              <span className="font-sans text-xs">
                                {rateLabel(familyChecked, familyTotal)}
                              </span>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-mono ${
                            event.track_student
                              ? rateCellColor(studentChecked, studentTotal)
                              : "text-muted-foreground"
                          }`}
                        >
                          {event.track_student ? (
                            <>
                              {rateString(studentChecked, studentTotal)}{" "}
                              <span className="font-sans text-xs">
                                {rateLabel(studentChecked, studentTotal)}
                              </span>
                            </>
                          ) : (
                            "-"
                          )}
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
