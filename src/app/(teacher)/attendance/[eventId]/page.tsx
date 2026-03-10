"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { useAttendanceStats } from "@/hooks/use-attendance-stats";
import { AttendanceStatsCard } from "@/components/attendance-stats-card";
import { FamilyCheckInDialog } from "@/components/family-check-in-dialog";
import { StudentCheckInList } from "@/components/student-check-in-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Loader2,
  Search,
  Users,
  CheckCircle2,
  Clock,
  UserCheck,
} from "lucide-react";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;
type Family = Tables<"families">;
type Student = Tables<"students">;

interface FamilyWithStudents {
  family: Family;
  students: Student[];
}

export default function TeacherCheckInPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { teacher } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [familiesMap, setFamiliesMap] = useState<Map<string, Family>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Family check-in dialog state
  const [checkInFamily, setCheckInFamily] = useState<Family | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Search
  const [familySearch, setFamilySearch] = useState("");

  // Realtime attendance
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
  } = useRealtimeAttendance(eventId);

  // Stats scoped to teacher's class
  const { overallStats } = useAttendanceStats({
    familyAttendance,
    studentAttendance,
    students: classStudents.map((s) => ({
      id: s.id,
      class_name: s.class_name,
      family_id: s.family_id,
    })),
    classFilter: teacher?.class_name ?? undefined,
  });

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const supabase = createClient();

      // Fetch event
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (eventError || !eventData) {
        console.error("Failed to fetch event:", eventError);
        setError("活动不存在或无法加载");
        setLoading(false);
        return;
      }

      setEvent(eventData);

      // Fetch students in teacher's class
      const { data: studentsData } = await supabase
        .from("students")
        .select("*")
        .eq("class_name", teacher!.class_name!)
        .order("name");

      const students = studentsData ?? [];
      setClassStudents(students);

      // Get unique family IDs
      const familyIds = [
        ...new Set(
          students
            .map((s) => s.family_id)
            .filter((id): id is string => id !== null)
        ),
      ];

      // Fetch family details
      if (familyIds.length > 0) {
        const { data: familiesData } = await supabase
          .from("families")
          .select("*")
          .in("id", familyIds);

        const map = new Map<string, Family>();
        for (const f of familiesData ?? []) {
          map.set(f.id, f);
        }
        setFamiliesMap(map);
      }

      setLoading(false);
    }

    fetchData();
  }, [eventId, teacher]);

  // Build unique families with their students
  const familiesWithStudents = useMemo(() => {
    const map = new Map<string, FamilyWithStudents>();

    for (const student of classStudents) {
      if (!student.family_id) continue;
      const family = familiesMap.get(student.family_id);
      if (!family) continue;

      if (!map.has(family.id)) {
        map.set(family.id, { family, students: [] });
      }
      map.get(family.id)!.students.push(student);
    }

    return Array.from(map.values());
  }, [classStudents, familiesMap]);

  // Build a lookup: family_id -> family_attendance record (for this event)
  const familyAttendanceMap = useMemo(() => {
    const map = new Map<string, Tables<"family_attendance">>();
    for (const fa of familyAttendance) {
      // Store by family_id, there should be at most one per family per event
      map.set(fa.family_id, fa);
    }
    return map;
  }, [familyAttendance]);

  // Filtered families by search
  const filteredFamilies = useMemo(() => {
    if (!familySearch.trim()) return familiesWithStudents;
    const query = familySearch.toLowerCase();
    return familiesWithStudents.filter(({ family, students: childList }) => {
      const guardianMatch =
        family.guardian1_name.toLowerCase().includes(query) ||
        (family.guardian2_name?.toLowerCase().includes(query) ?? false);
      const studentMatch = childList.some((s) =>
        s.name.toLowerCase().includes(query)
      );
      return guardianMatch || studentMatch;
    });
  }, [familiesWithStudents, familySearch]);

  // Determine default tab
  const defaultTab = event?.track_family ? "family" : "student";

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

  if (error || !event) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/attendance")}>
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <p>{error ?? "活动不存在"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/attendance")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {teacher.class_name} 班
          </p>
        </div>
      </div>

      {attendanceLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {event.track_family && (
              <TabsTrigger value="family">
                <Users className="size-3.5" />
                家庭签到
              </TabsTrigger>
            )}
            {event.track_student && (
              <TabsTrigger value="student">
                <UserCheck className="size-3.5" />
                学生签到
              </TabsTrigger>
            )}
          </TabsList>

          {/* Family tab */}
          {event.track_family && (
            <TabsContent value="family" className="space-y-4">
              {/* Stats card */}
              <AttendanceStatsCard
                title="班级家庭出席率"
                value={`${overallStats.checkedInFamilies}/${overallStats.totalFamilies}`}
                percentage={Math.round(overallStats.familyRate * 100)}
                description={`${teacher.class_name} 班已签到家庭数`}
              />

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索家长姓名..."
                  value={familySearch}
                  onChange={(e) => setFamilySearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Family list */}
              <div className="space-y-2">
                {filteredFamilies.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    无匹配的家庭
                  </div>
                ) : (
                  filteredFamilies.map(({ family, students: children }) => {
                    const attendance = familyAttendanceMap.get(family.id);
                    const isCheckedInByMyClass =
                      attendance?.class_name === teacher.class_name;
                    const isCheckedInByOther =
                      attendance && !isCheckedInByMyClass;
                    const isCheckedIn = !!attendance;

                    return (
                      <div
                        key={family.id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {family.guardian1_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {children.map((c) => c.name).join("、")}
                          </p>
                        </div>

                        <div className="shrink-0">
                          {isCheckedInByMyClass && (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="size-3" />
                                已签到
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(
                                  attendance.checked_in_at
                                ).toLocaleTimeString("zh-CN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          )}
                          {isCheckedInByOther && (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="size-3" />
                              已由 {attendance.class_name} 签到
                            </Badge>
                          )}
                          {!isCheckedIn && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setCheckInFamily(family);
                                setDialogOpen(true);
                              }}
                            >
                              签到
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>
          )}

          {/* Student tab */}
          {event.track_student && (
            <TabsContent value="student" className="space-y-4">
              {/* Stats card */}
              <AttendanceStatsCard
                title="班级学生出席率"
                value={`${overallStats.checkedInStudents}/${overallStats.totalStudents}`}
                percentage={Math.round(overallStats.studentRate * 100)}
                description={`${teacher.class_name} 班已签到学生数`}
              />

              <StudentCheckInList
                students={classStudents.map((s) => ({
                  id: s.id,
                  name: s.name,
                  class_name: s.class_name,
                }))}
                studentAttendance={studentAttendance}
                eventId={eventId}
                teacherId={teacher.id}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Family check-in dialog */}
      {checkInFamily && (
        <FamilyCheckInDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          family={{
            id: checkInFamily.id,
            guardian1_name: checkInFamily.guardian1_name,
            guardian1_relationship: checkInFamily.guardian1_relationship,
            guardian1_ic: checkInFamily.guardian1_ic,
            guardian2_name: checkInFamily.guardian2_name,
            guardian2_relationship: checkInFamily.guardian2_relationship,
            guardian2_ic: checkInFamily.guardian2_ic,
          }}
          eventId={eventId}
          className={teacher.class_name!}
          teacherId={teacher.id}
        />
      )}
    </div>
  );
}
