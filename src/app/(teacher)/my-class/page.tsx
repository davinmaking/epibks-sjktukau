"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  Phone,
  MapPin,
  User,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Tables } from "@/lib/types";

type Event = Tables<"events">;
type Student = Tables<"students">;
type Family = Tables<"families">;

type StudentWithFamily = Student & {
  families: Family | null;
};

export default function MyClassPage() {
  const { teacher } = useAuth();
  const [students, setStudents] = useState<StudentWithFamily[]>([]);
  const [allStudents, setAllStudents] = useState<
    Pick<Student, "id" | "name" | "class_name" | "family_id">[]
  >([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!teacher?.class_name) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      const supabase = createClient();

      // Fetch students in this class with family data
      const { data: classStudents, error } = await supabase
        .from("students")
        .select("*, families(*)")
        .eq("class_name", teacher!.class_name!)
        .order("name");

      if (error) {
        console.error("Failed to fetch students:", error);
        setLoading(false);
        return;
      }

      const studentsData = (classStudents ?? []) as StudentWithFamily[];
      setStudents(studentsData);

      // Fetch events (ordered by date desc, limit to recent ones)
      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: false })
        .limit(10);

      setEvents(eventsData ?? []);

      // Collect all family_ids from this class for sibling lookup
      const familyIds = [
        ...new Set(
          studentsData
            .map((s) => s.family_id)
            .filter((id): id is string => id !== null)
        ),
      ];

      if (familyIds.length > 0) {
        // Fetch all students who share these family_ids (for sibling lookup)
        const { data: siblingCandidates } = await supabase
          .from("students")
          .select("id, name, class_name, family_id")
          .in("family_id", familyIds);

        setAllStudents(siblingCandidates ?? []);
      }

      setLoading(false);
    }

    fetchData();
  }, [teacher]);

  // Active events: upcoming/today events, or fallback to the 2 most recent
  const activeEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter((e) => e.date >= today);
    if (upcoming.length > 0) {
      // Sort upcoming by date ascending (soonest first)
      return upcoming.sort((a, b) => a.date.localeCompare(b.date));
    }
    // Fallback: show 2 most recent events (already sorted desc)
    return events.slice(0, 2);
  }, [events]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const term = search.toLowerCase();
    return students.filter((s) => s.name.toLowerCase().includes(term));
  }, [students, search]);

  // Build a map of family_id -> sibling students for quick lookup
  const siblingsMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; class_name: string }[]>();
    for (const s of allStudents) {
      if (!s.family_id) continue;
      const list = map.get(s.family_id) ?? [];
      list.push({ id: s.id, name: s.name, class_name: s.class_name });
      map.set(s.family_id, list);
    }
    return map;
  }, [allStudents]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getSiblings(student: StudentWithFamily) {
    if (!student.family_id) return [];
    const candidates = siblingsMap.get(student.family_id) ?? [];
    return candidates.filter((s) => s.id !== student.id);
  }

  function formatGender(gender: string | null) {
    if (gender === "L" || gender === "男") return "男";
    if (gender === "P" || gender === "女") return "女";
    return gender ?? "-";
  }

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          我的班级 - {teacher.class_name}
        </h1>
        <Badge variant="secondary">{filteredStudents.length} 名学生</Badge>
      </div>

      {/* Active Events */}
      {activeEvents.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarDays className="size-4" />
            活动签到
          </h2>
          <div className="grid gap-2">
            {activeEvents.map((evt) => {
              const isToday = evt.date === new Date().toISOString().slice(0, 10);
              const isPast = evt.date < new Date().toISOString().slice(0, 10);

              return (
                <Link
                  key={evt.id}
                  href={`/attendance/${evt.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{evt.name}</p>
                      {isToday && (
                        <Badge variant="default" className="text-xs">
                          今天
                        </Badge>
                      )}
                      {isPast && (
                        <Badge variant="secondary" className="text-xs">
                          已结束
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(evt.date)}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索学生姓名..."
          aria-label="搜索学生姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Student List */}
      {filteredStudents.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
          <Users className="size-10" />
          <p>{search ? "未找到匹配的学生" : "暂无学生记录"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStudents.map((student) => {
            const isExpanded = expandedIds.has(student.id);
            const siblings = getSiblings(student);
            const family = student.families;

            return (
              <Card
                key={student.id}
                className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleExpand(student.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpand(student.id);
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle>{student.name}</CardTitle>
                      <Badge variant="outline">
                        {formatGender(student.gender)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {student.ic_number ?? "-"}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4">
                    <Separator />

                    {/* Student Details */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">出生日期</span>
                        <p className="font-medium">
                          {student.date_of_birth ?? "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">民族</span>
                        <p className="font-medium">
                          {student.ethnicity ?? "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">宗教</span>
                        <p className="font-medium">
                          {student.religion ?? "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">状态</span>
                        <p className="font-medium">
                          {student.status ?? "-"}
                        </p>
                      </div>
                    </div>

                    {/* Guardian Info */}
                    {family && (
                      <>
                        <Separator />
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold flex items-center gap-1.5">
                            <User className="size-4" />
                            监护人信息
                          </h3>

                          {/* Guardian 1 */}
                          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                            <p className="font-medium">
                              {family.guardian1_name}
                              {family.guardian1_relationship && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({family.guardian1_relationship})
                                </span>
                              )}
                            </p>
                            {family.guardian1_phone && (
                              <p className="flex items-center gap-1.5 text-muted-foreground">
                                <Phone className="size-3.5" />
                                {family.guardian1_phone}
                              </p>
                            )}
                          </div>

                          {/* Guardian 2 */}
                          {family.guardian2_name && (
                            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                              <p className="font-medium">
                                {family.guardian2_name}
                                {family.guardian2_relationship && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({family.guardian2_relationship})
                                  </span>
                                )}
                              </p>
                              {family.guardian2_phone && (
                                <p className="flex items-center gap-1.5 text-muted-foreground">
                                  <Phone className="size-3.5" />
                                  {family.guardian2_phone}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Address */}
                          {family.address && (
                            <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="mt-0.5 size-3.5 shrink-0" />
                              <span>{family.address}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Siblings */}
                    {siblings.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold flex items-center gap-1.5">
                            <Users className="size-4" />
                            兄弟姐妹
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {siblings.map((sib) => (
                              <Badge key={sib.id} variant="outline">
                                {sib.name}
                                <span className="ml-1 text-muted-foreground">
                                  ({sib.class_name})
                                </span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
