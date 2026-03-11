"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance";
import { FamilyCheckInDialog } from "@/components/family-check-in-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Search,
  Users,
  CheckCircle2,
  UserCheck,
  Undo2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;
type Family = Tables<"families">;
type Student = Tables<"students">;

interface FamilyGroup {
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
  const [familiesMap, setFamiliesMap] = useState<Map<string, Family>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [selectedFamily, setSelectedFamily] = useState<FamilyGroup | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Search
  const [search, setSearch] = useState("");

  // Undo family check-in
  const [undoingFamilyIds, setUndoingFamilyIds] = useState<Set<string>>(new Set());

  // Direct student toggle (for student-only events)
  const [togglingStudentIds, setTogglingStudentIds] = useState<Set<string>>(new Set());

  // Realtime attendance
  const {
    familyAttendance,
    studentAttendance,
    isLoading: attendanceLoading,
    refetch: refetchAttendance,
  } = useRealtimeAttendance(eventId);

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const supabase = createClient();

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (eventError || !eventData) {
        setError("活动不存在或无法加载");
        setLoading(false);
        return;
      }

      setEvent(eventData);

      const { data: studentsData } = await supabase
        .from("students")
        .select("*")
        .eq("class_name", teacher!.class_name!)
        .order("name");

      const students = studentsData ?? [];
      setClassStudents(students);

      const familyIds = [
        ...new Set(
          students
            .map((s) => s.family_id)
            .filter((id): id is string => id !== null)
        ),
      ];

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

  // Build family groups (keyed by family, with their students in this class)
  const familyGroups = useMemo(() => {
    const map = new Map<string, FamilyGroup>();

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

  // Lookup maps
  const familyAttendanceMap = useMemo(() => {
    const map = new Map<string, Tables<"family_attendance">>();
    for (const fa of familyAttendance) {
      map.set(fa.family_id, fa);
    }
    return map;
  }, [familyAttendance]);

  const checkedInStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const sa of studentAttendance) {
      set.add(sa.student_id);
    }
    return set;
  }, [studentAttendance]);

  // Stats
  const totalFamilies = familyGroups.length;
  const checkedInFamilies = familyGroups.filter(
    ({ family }) => familyAttendanceMap.has(family.id)
  ).length;
  const totalStudents = classStudents.length;
  const checkedInStudents = classStudents.filter(
    (s) => checkedInStudentIds.has(s.id)
  ).length;

  // Determine completion status per family
  function getFamilyStatus(group: FamilyGroup) {
    const familyDone = !event?.track_family || familyAttendanceMap.has(group.family.id);
    const studentsDone = !event?.track_student || group.students.every((s) => checkedInStudentIds.has(s.id));
    return { familyDone, studentsDone, allDone: familyDone && studentsDone };
  }

  // Filtered & sorted families
  const filteredFamilies = useMemo(() => {
    let result = familyGroups;

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(({ family, students: children }) => {
        const studentMatch = children.some((s) => s.name.toLowerCase().includes(query));
        const guardianMatch =
          family.guardian1_name.toLowerCase().includes(query) ||
          (family.guardian2_name?.toLowerCase().includes(query) ?? false);
        const icMatch =
          family.guardian1_ic?.toLowerCase().includes(query) ||
          (family.guardian2_ic?.toLowerCase().includes(query) ?? false);
        return studentMatch || guardianMatch || icMatch;
      });
    }

    // Sort: incomplete first
    result = [...result].sort((a, b) => {
      const aDone = getFamilyStatus(a).allDone ? 1 : 0;
      const bDone = getFamilyStatus(b).allDone ? 1 : 0;
      return aDone - bDone;
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyGroups, search, familyAttendanceMap, checkedInStudentIds]);

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
      toast.error("撤回签到失败");
      return;
    }

    toast.success("已撤回家长签到");
    refetchAttendance();
  }

  async function handleToggleStudent(studentId: string, isCheckedIn: boolean) {
    setTogglingStudentIds((prev) => new Set(prev).add(studentId));
    const supabase = createClient();

    if (isCheckedIn) {
      const { error } = await supabase
        .from("student_attendance")
        .delete()
        .eq("event_id", eventId)
        .eq("student_id", studentId);
      if (error) toast.error("取消签到失败");
    } else {
      const { error } = await supabase
        .from("student_attendance")
        .upsert(
          { event_id: eventId, student_id: studentId, checked_in_by: teacher!.id },
          { onConflict: "event_id,student_id" }
        );
      if (error) toast.error("签到失败");
    }

    setTogglingStudentIds((prev) => {
      const next = new Set(prev);
      next.delete(studentId);
      return next;
    });
    refetchAttendance();
  }

  // Student-only mode: filter & sort students directly
  const studentOnly = event?.track_student && !event?.track_family;

  const filteredStudents = useMemo(() => {
    if (!studentOnly) return [];
    let result = classStudents;
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(query));
    }
    // Sort: unchecked first
    return [...result].sort((a, b) => {
      const aChecked = checkedInStudentIds.has(a.id) ? 1 : 0;
      const bChecked = checkedInStudentIds.has(b.id) ? 1 : 0;
      return aChecked - bChecked;
    });
  }, [studentOnly, classStudents, search, checkedInStudentIds]);

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

      {/* Sticky progress bar */}
      <div className="sticky top-14 z-10 -mx-1 rounded-lg bg-background/95 px-1 py-2 backdrop-blur-sm md:top-0">
        {event.track_family && (
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">家庭 {checkedInFamilies}/{totalFamilies}</span>
              <span className="font-medium text-muted-foreground">
                {totalFamilies > 0 ? Math.round((checkedInFamilies / totalFamilies) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${totalFamilies > 0 ? Math.round((checkedInFamilies / totalFamilies) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
        {event.track_student && (
          <div className={event.track_family ? "mt-2" : ""}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">学生 {checkedInStudents}/{totalStudents}</span>
              <span className="font-medium text-muted-foreground">
                {totalStudents > 0 ? Math.round((checkedInStudents / totalStudents) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${totalStudents > 0 ? Math.round((checkedInStudents / totalStudents) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索学生或家长姓名..."
          aria-label="搜索学生或家长姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-[44px] pl-9"
          autoComplete="off"
          autoCorrect="off"
        />
      </div>

      {/* Student-only mode: direct toggle per student */}
      {studentOnly ? (
        <div className="space-y-1.5">
          {filteredStudents.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-8" />
              无匹配结果
            </div>
          ) : (
            filteredStudents.map((student) => {
              const isCheckedIn = checkedInStudentIds.has(student.id);
              const isToggling = togglingStudentIds.has(student.id);
              return (
                <label
                  key={student.id}
                  className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                    isCheckedIn
                      ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                      : "border-primary/20 bg-background hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  {isToggling ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <Checkbox
                      checked={isCheckedIn}
                      onCheckedChange={() => handleToggleStudent(student.id, isCheckedIn)}
                      disabled={isToggling}
                      className="size-5"
                    />
                  )}
                  <span className={isCheckedIn ? "font-medium" : ""}>
                    {student.name}
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : (
        <>
          {/* Family list — children's names first */}
          <div className="space-y-2">
            {filteredFamilies.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-8" />
                无匹配结果
              </div>
            ) : (
              filteredFamilies.map((group) => {
                const { family, students: children } = group;
                const { familyDone, studentsDone, allDone } = getFamilyStatus(group);
                const attendance = familyAttendanceMap.get(family.id);
                const isCheckedInByOther = attendance && attendance.class_name !== teacher.class_name;

                return (
                  <div
                    key={family.id}
                    className={`flex min-h-[60px] cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                      allDone
                        ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                        : "border-primary/20 bg-background hover:border-primary/40 hover:shadow-sm active:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedFamily(group);
                      setDialogOpen(true);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      {/* Children's names — primary display */}
                      <p className={`font-medium ${allDone ? "text-muted-foreground" : ""}`}>
                        {children.map((c) => c.name).join("、")}
                      </p>
                      {/* Guardian name — secondary */}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {family.guardian1_name}
                        {family.guardian2_name ? ` / ${family.guardian2_name}` : ""}
                      </p>
                      {/* Status badges */}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {event.track_family && familyDone && (
                          <Badge variant="outline" className="gap-1 border-green-300 text-xs text-green-700 dark:border-green-800 dark:text-green-400">
                            <CheckCircle2 className="size-3" />
                            家长
                          </Badge>
                        )}
                        {event.track_student && children.map((c) => (
                          checkedInStudentIds.has(c.id) && (
                            <Badge key={c.id} variant="outline" className="gap-1 border-green-300 text-xs text-green-700 dark:border-green-800 dark:text-green-400">
                              <CheckCircle2 className="size-3" />
                              {c.name}
                            </Badge>
                          )
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {familyDone && attendance && attendance.class_name === teacher.class_name && event.track_family && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {new Date(attendance.checked_in_at).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                            disabled={undoingFamilyIds.has(family.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUndoFamilyCheckIn(family.id);
                            }}
                            aria-label="撤回家长签到"
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
                        <Badge variant="secondary" className="text-xs">
                          已由 {attendance.class_name} 签到
                        </Badge>
                      )}
                      {!allDone ? (
                        <Button
                          size="sm"
                          className="min-h-[36px] gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFamily(group);
                            setDialogOpen(true);
                          }}
                        >
                          <UserCheck className="size-3.5" />
                          签到
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[36px] gap-1 text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFamily(group);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-3" />
                          编辑
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Check-in dialog */}
          {selectedFamily && (
            <FamilyCheckInDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              family={{
                id: selectedFamily.family.id,
                guardian1_name: selectedFamily.family.guardian1_name,
                guardian1_relationship: selectedFamily.family.guardian1_relationship,
                guardian1_ic: selectedFamily.family.guardian1_ic,
                guardian2_name: selectedFamily.family.guardian2_name,
                guardian2_relationship: selectedFamily.family.guardian2_relationship,
                guardian2_ic: selectedFamily.family.guardian2_ic,
              }}
              students={selectedFamily.students.map((s) => ({ id: s.id, name: s.name }))}
              eventId={eventId}
              className={teacher.class_name!}
              teacherId={teacher.id}
              trackFamily={event.track_family}
              trackStudent={event.track_student}
              checkedInStudentIds={checkedInStudentIds}
              familyAlreadyCheckedIn={familyAttendanceMap.has(selectedFamily.family.id)}
              onSuccess={refetchAttendance}
            />
          )}
        </>
      )}
    </div>
  );
}
