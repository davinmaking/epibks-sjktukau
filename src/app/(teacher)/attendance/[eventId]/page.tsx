"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { useAttendanceStats } from "@/hooks/use-attendance-stats";
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
  Undo2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";
import type { AttendeeEntry } from "@/lib/constants";

type Event = Tables<"events">;
type Family = Tables<"families">;
type Student = Tables<"students">;

/** Extract attendee type labels from a family_attendance record */
function getAttendeeLabels(attendance: Tables<"family_attendance">): string[] {
  // Try JSONB attendees first (new format)
  if (attendance.attendees && Array.isArray(attendance.attendees)) {
    return (attendance.attendees as unknown as AttendeeEntry[]).map((a) => a.type);
  }
  // Fallback to legacy single column
  return attendance.attendee_type ? [attendance.attendee_type] : [];
}

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
  const [quickCheckInMode, setQuickCheckInMode] = useState(false);

  // Search & filter
  const [familySearch, setFamilySearch] = useState("");
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false);

  // Undo family check-in
  const [undoingFamilyIds, setUndoingFamilyIds] = useState<Set<string>>(new Set());

  // Realtime attendance
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
    refetch: refetchAttendance,
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

  async function handleUndoFamilyCheckIn(familyId: string) {
    setUndoingFamilyIds((prev) => new Set(prev).add(familyId));

    const supabase = createClient();
    const { error } = await supabase
      .from("family_attendance")
      .delete()
      .eq("event_id", eventId)
      .eq("family_id", familyId);

    setUndoingFamilyIds((prev) => {
      const next = new Set(prev);
      next.delete(familyId);
      return next;
    });

    if (error) {
      console.error("Failed to undo family check-in:", error.message, error.code);
      toast.error("撤回签到失败");
      return;
    }

    toast.success("已撤回签到");
    // Refetch as fallback in case realtime doesn't deliver the update
    refetchAttendance();
  }

  // Check if a family has pre-filled guardian data (for quick check-in)
  function hasPrefilledData(family: Family): boolean {
    return !!(family.guardian1_name && family.guardian1_relationship);
  }

  // Filtered & sorted families: unchecked first, search by name/IC
  const filteredFamilies = useMemo(() => {
    let result = familiesWithStudents;

    // Filter: unchecked only
    if (showUncheckedOnly) {
      result = result.filter(({ family }) => !familyAttendanceMap.has(family.id));
    }

    // Search by guardian name, student name, or IC
    if (familySearch.trim()) {
      const query = familySearch.toLowerCase();
      result = result.filter(({ family, students: childList }) => {
        const guardianMatch =
          family.guardian1_name.toLowerCase().includes(query) ||
          (family.guardian2_name?.toLowerCase().includes(query) ?? false);
        const icMatch =
          family.guardian1_ic?.toLowerCase().includes(query) ||
          (family.guardian2_ic?.toLowerCase().includes(query) ?? false);
        const studentMatch = childList.some((s) =>
          s.name.toLowerCase().includes(query)
        );
        return guardianMatch || icMatch || studentMatch;
      });
    }

    // Sort: unchecked families first, checked-in at bottom
    result = [...result].sort((a, b) => {
      const aChecked = familyAttendanceMap.has(a.family.id) ? 1 : 0;
      const bChecked = familyAttendanceMap.has(b.family.id) ? 1 : 0;
      return aChecked - bChecked;
    });

    return result;
  }, [familiesWithStudents, familySearch, showUncheckedOnly, familyAttendanceMap]);

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

  if (loading || attendanceLoading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="加载中">
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

  const uncheckedCount = familiesWithStudents.filter(
    ({ family }) => !familyAttendanceMap.has(family.id)
  ).length;

  return (
    <div className="touch-manipulation space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => router.push("/attendance")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {teacher.class_name} 班
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {event.track_family && (
            <TabsTrigger value="family" className="min-h-[44px] gap-1.5 px-4">
              <Users className="size-4" />
              家庭签到
            </TabsTrigger>
          )}
          {event.track_student && (
            <TabsTrigger value="student" className="min-h-[44px] gap-1.5 px-4">
              <UserCheck className="size-4" />
              学生签到
            </TabsTrigger>
          )}
        </TabsList>

        {/* Family tab */}
        {event.track_family && (
          <TabsContent value="family" className="space-y-4">
            {/* Sticky progress bar */}
            <div className="sticky top-14 z-10 -mx-1 rounded-lg bg-background/95 px-1 py-2 backdrop-blur-sm md:top-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  已签到 {overallStats.checkedInFamilies}/{overallStats.totalFamilies} 家庭
                </span>
                <span className="font-medium text-muted-foreground">
                  {Math.round(overallStats.familyRate * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.round(overallStats.familyRate * 100)}%` }}
                />
              </div>
            </div>

            {/* Search bar + filter toggle */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索姓名或身份证号码..."
                  aria-label="搜索家长姓名或身份证号码"
                  value={familySearch}
                  onChange={(e) => setFamilySearch(e.target.value)}
                  className="min-h-[44px] pl-9"
                  autoComplete="off"
                  autoCorrect="off"
                />
              </div>
              <Button
                variant={showUncheckedOnly ? "default" : "outline"}
                size="icon"
                className="relative min-h-[44px] min-w-[44px]"
                onClick={() => setShowUncheckedOnly((v) => !v)}
                aria-label={showUncheckedOnly ? "显示所有家庭" : "只显示未签到"}
                title={showUncheckedOnly ? "显示所有家庭" : "只显示未签到"}
              >
                <Filter className="size-4" />
                {showUncheckedOnly && uncheckedCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {uncheckedCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Family list */}
            <div className="space-y-2">
              {filteredFamilies.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-8" />
                  {showUncheckedOnly ? "所有家庭已签到" : "无匹配的家庭"}
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
                      className={`flex min-h-[60px] items-center justify-between gap-3 rounded-lg border p-3 transition-all duration-200 ${
                        !isCheckedIn
                          ? "cursor-pointer border-primary/20 bg-background hover:border-primary/40 hover:shadow-sm active:scale-[0.98] active:bg-muted/50"
                          : isCheckedInByMyClass
                            ? "border-green-200 bg-green-50/50 opacity-75 dark:border-green-900 dark:bg-green-950/20"
                            : "opacity-50"
                      }`}
                      onClick={
                        !isCheckedIn
                          ? () => {
                              setCheckInFamily(family);
                              if (hasPrefilledData(family)) {
                                // Quick check-in: single tap
                                setQuickCheckInMode(true);
                                setDialogOpen(true);
                              } else {
                                // Full dialog for families without data
                                setQuickCheckInMode(false);
                                setDialogOpen(true);
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium ${isCheckedIn ? "text-muted-foreground" : ""}`}>
                          {family.guardian1_name}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {children.map((c) => (
                            <Badge key={c.id} variant="outline" className="text-xs font-normal">
                              {c.name}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {isCheckedInByMyClass && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="size-4 text-green-600" />
                              <span className="text-xs text-muted-foreground">
                                {new Date(
                                  attendance.checked_in_at
                                ).toLocaleTimeString("zh-CN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                              disabled={undoingFamilyIds.has(family.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUndoFamilyCheckIn(family.id);
                              }}
                              aria-label="撤回签到"
                            >
                              {undoingFamilyIds.has(family.id) ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Undo2 className="size-4" />
                              )}
                            </Button>
                          </>
                        )}
                        {isCheckedInByOther && (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="size-3" />
                            已由 {attendance.class_name} 签到
                          </Badge>
                        )}
                        {!isCheckedIn && (
                          <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/10">
                            <UserCheck className="size-3" />
                            {hasPrefilledData(family) ? "快速签到" : "签到"}
                          </Badge>
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
            {/* Sticky progress bar */}
            <div className="sticky top-14 z-10 -mx-1 rounded-lg bg-background/95 px-1 py-2 backdrop-blur-sm md:top-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  已签到 {overallStats.checkedInStudents}/{overallStats.totalStudents} 学生
                </span>
                <span className="font-medium text-muted-foreground">
                  {Math.round(overallStats.studentRate * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.round(overallStats.studentRate * 100)}%` }}
                />
              </div>
            </div>

            <StudentCheckInList
              students={classStudents.map((s) => ({
                id: s.id,
                name: s.name,
                class_name: s.class_name,
              }))}
              studentAttendance={studentAttendance}
              eventId={eventId}
              teacherId={teacher.id}
              onMutate={refetchAttendance}
            />
          </TabsContent>
        )}
      </Tabs>

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
          onSuccess={refetchAttendance}
          quickCheckIn={quickCheckInMode}
        />
      )}
    </div>
  );
}
