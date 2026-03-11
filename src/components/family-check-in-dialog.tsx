"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AttendeeEntry } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FamilyData {
  id: string;
  guardian1_name: string;
  guardian1_relationship: string | null;
  guardian1_ic: string;
  guardian2_name: string | null;
  guardian2_relationship: string | null;
  guardian2_ic: string | null;
}

interface StudentData {
  id: string;
  name: string;
}

interface FamilyCheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: FamilyData;
  students: StudentData[];
  eventId: string;
  className: string;
  teacherId: string;
  trackFamily: boolean;
  trackStudent: boolean;
  /** Already checked-in student IDs (to pre-check them) */
  checkedInStudentIds?: Set<string>;
  /** Whether this family already has a family_attendance record */
  familyAlreadyCheckedIn?: boolean;
  onSuccess?: () => void;
}

export function FamilyCheckInDialog({
  open,
  onOpenChange,
  family,
  students,
  eventId,
  className,
  teacherId,
  trackFamily,
  trackStudent,
  checkedInStudentIds,
  familyAlreadyCheckedIn,
  onSuccess,
}: FamilyCheckInDialogProps) {
  // Guardian selections
  const [guardian1Selected, setGuardian1Selected] = useState(false);
  const [guardian2Selected, setGuardian2Selected] = useState(false);
  const [otherSelected, setOtherSelected] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [otherIc, setOtherIc] = useState("");
  const [otherRelationship, setOtherRelationship] = useState("");

  // Student selections
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setGuardian1Selected(false);
      setGuardian2Selected(false);
      setOtherSelected(false);
      setOtherName("");
      setOtherIc("");
      setOtherRelationship("");
      setSelectedStudentIds(new Set());
      return;
    }

    // Pre-select guardians if family not yet checked in
    if (trackFamily && !familyAlreadyCheckedIn) {
      setGuardian1Selected(!!family.guardian1_name);
      setGuardian2Selected(!!family.guardian2_name);
    }

    // Pre-select already checked-in students
    if (trackStudent && checkedInStudentIds) {
      setSelectedStudentIds(new Set(checkedInStudentIds));
    }
  }, [open, family, trackFamily, trackStudent, familyAlreadyCheckedIn, checkedInStudentIds]);

  const hasGuardian2 = !!family.guardian2_name;
  const anyGuardianSelected = guardian1Selected || guardian2Selected || otherSelected;

  // Whether family attendance needs to be submitted
  const needsFamilySubmit = trackFamily && !familyAlreadyCheckedIn && anyGuardianSelected;

  // Which students changed (newly checked or unchecked)
  const studentsToCheckIn = trackStudent
    ? students.filter((s) => selectedStudentIds.has(s.id) && !checkedInStudentIds?.has(s.id))
    : [];
  const studentsToUncheck = trackStudent
    ? students.filter((s) => !selectedStudentIds.has(s.id) && checkedInStudentIds?.has(s.id))
    : [];
  const hasStudentChanges = studentsToCheckIn.length > 0 || studentsToUncheck.length > 0;

  const canSubmit = needsFamilySubmit || hasStudentChanges;

  async function handleConfirm() {
    // Validate "其他" fields
    if (otherSelected && !otherName.trim()) {
      toast.error("请输入「其他」出席者的姓名");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    let hasError = false;

    // 1. Family attendance insert
    if (needsFamilySubmit) {
      const attendees: AttendeeEntry[] = [];

      if (guardian1Selected) {
        attendees.push({
          type: family.guardian1_relationship ?? "监护人",
          name: family.guardian1_name,
          ic: family.guardian1_ic,
          relationship: family.guardian1_relationship ?? "",
        });
      }
      if (guardian2Selected && family.guardian2_name) {
        attendees.push({
          type: family.guardian2_relationship ?? "监护人",
          name: family.guardian2_name,
          ic: family.guardian2_ic ?? "",
          relationship: family.guardian2_relationship ?? "",
        });
      }
      if (otherSelected) {
        attendees.push({
          type: "其他",
          name: otherName.trim(),
          ic: otherIc.trim(),
          relationship: otherRelationship.trim(),
        });
      }

      const first = attendees[0];
      const { error } = await supabase.from("family_attendance").insert({
        event_id: eventId,
        family_id: family.id,
        class_name: className,
        attendee_type: first.type,
        attendee_name: first.name || null,
        attendee_ic: first.ic || null,
        attendee_relationship: first.relationship || null,
        attendees: attendees as unknown as Record<string, unknown>[],
        checked_in_by: teacherId,
      });

      if (error) {
        hasError = true;
        if (error.code === "23505") {
          toast.error("该家庭已签到");
        } else {
          console.error("Family check-in error:", error);
          toast.error("家长签到失败，请重试");
        }
      }
    }

    // 2. Student check-ins (upsert new ones)
    if (!hasError && studentsToCheckIn.length > 0) {
      const records = studentsToCheckIn.map((s) => ({
        event_id: eventId,
        student_id: s.id,
        checked_in_by: teacherId,
      }));
      const { error } = await supabase
        .from("student_attendance")
        .upsert(records, { onConflict: "event_id,student_id" });

      if (error) {
        hasError = true;
        console.error("Student check-in error:", error);
        toast.error("学生签到失败，请重试");
      }
    }

    // 3. Student unchecks (delete)
    if (!hasError && studentsToUncheck.length > 0) {
      const { error } = await supabase
        .from("student_attendance")
        .delete()
        .eq("event_id", eventId)
        .in("student_id", studentsToUncheck.map((s) => s.id));

      if (error) {
        hasError = true;
        console.error("Student uncheck error:", error);
        toast.error("取消学生签到失败");
      }
    }

    setSubmitting(false);

    if (hasError) return;

    // Build success message
    const parts: string[] = [];
    if (needsFamilySubmit) parts.push("家庭出席已记录");
    if (studentsToCheckIn.length > 0) parts.push(`${studentsToCheckIn.length}名学生已签到`);
    if (studentsToUncheck.length > 0) parts.push(`${studentsToUncheck.length}名学生已取消`);
    toast.success(parts.join("，") || "已更新");

    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>出席登记</DialogTitle>
          <DialogDescription>
            {students.map((s) => s.name).join("、")} 的家庭
          </DialogDescription>
        </DialogHeader>

        <div className="touch-manipulation space-y-5 py-2">
          {/* Family / Guardian attendance */}
          {trackFamily && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                家长出席
                {familyAlreadyCheckedIn && (
                  <span className="ml-2 text-xs font-normal text-green-600">已签到</span>
                )}
              </p>

              {familyAlreadyCheckedIn ? (
                <p className="text-xs text-muted-foreground">此家庭已完成家长签到</p>
              ) : (
                <div className="space-y-1.5">
                  {/* Guardian 1 */}
                  <label
                    className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                      guardian1Selected
                        ? "border-primary/30 bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={guardian1Selected}
                      onCheckedChange={(c) => setGuardian1Selected(c === true)}
                      className="size-5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={guardian1Selected ? "font-medium" : ""}>
                        {family.guardian1_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {family.guardian1_relationship ?? "监护人"} · {family.guardian1_ic}
                      </p>
                    </div>
                  </label>

                  {/* Guardian 2 */}
                  {hasGuardian2 && (
                    <label
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                        guardian2Selected
                          ? "border-primary/30 bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={guardian2Selected}
                        onCheckedChange={(c) => setGuardian2Selected(c === true)}
                        className="size-5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={guardian2Selected ? "font-medium" : ""}>
                          {family.guardian2_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {family.guardian2_relationship ?? "监护人"} · {family.guardian2_ic ?? ""}
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Other */}
                  <div className="space-y-2">
                    <label
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                        otherSelected
                          ? "border-primary/30 bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={otherSelected}
                        onCheckedChange={(c) => setOtherSelected(c === true)}
                        className="size-5"
                      />
                      <span className={otherSelected ? "font-medium" : ""}>其他</span>
                    </label>

                    {otherSelected && (
                      <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-4">
                        <div className="space-y-1">
                          <label htmlFor="other-name" className="text-xs font-medium text-muted-foreground">
                            姓名 <span className="text-destructive">*</span>
                          </label>
                          <Input
                            id="other-name"
                            value={otherName}
                            onChange={(e) => setOtherName(e.target.value)}
                            placeholder="出席者姓名"
                            className="min-h-[40px] text-sm"
                            autoComplete="off"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="other-ic" className="text-xs font-medium text-muted-foreground">
                            身份证号码
                          </label>
                          <Input
                            id="other-ic"
                            value={otherIc}
                            onChange={(e) => setOtherIc(e.target.value)}
                            placeholder="身份证号码（选填）"
                            className="min-h-[40px] text-sm"
                            inputMode="numeric"
                            autoComplete="off"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="other-rel" className="text-xs font-medium text-muted-foreground">
                            关系
                          </label>
                          <Input
                            id="other-rel"
                            value={otherRelationship}
                            onChange={(e) => setOtherRelationship(e.target.value)}
                            placeholder="与学生的关系（选填）"
                            className="min-h-[40px] text-sm"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Student attendance */}
          {trackStudent && (
            <div className="space-y-2">
              <p className="text-sm font-medium">学生出席</p>
              <div className="space-y-1.5">
                {students.map((student) => {
                  const isChecked = selectedStudentIds.has(student.id);
                  return (
                    <label
                      key={student.id}
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                        isChecked
                          ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(c) => {
                          setSelectedStudentIds((prev) => {
                            const next = new Set(prev);
                            if (c === true) {
                              next.add(student.id);
                            } else {
                              next.delete(student.id);
                            }
                            return next;
                          });
                        }}
                        className="size-5"
                      />
                      <span className={isChecked ? "font-medium" : ""}>
                        {student.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={submitting || !canSubmit}
            className="min-h-[48px] w-full text-base"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
