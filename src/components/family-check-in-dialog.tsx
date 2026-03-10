"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATTENDEE_TYPES, type AttendeeEntry } from "@/lib/constants";
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

interface FamilyCheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: FamilyData;
  eventId: string;
  className: string;
  teacherId: string;
  onSuccess?: () => void;
}

interface AttendeeFormData {
  name: string;
  ic: string;
  relationship: string;
}

export function FamilyCheckInDialog({
  open,
  onOpenChange,
  family,
  eventId,
  className,
  teacherId,
  onSuccess,
}: FamilyCheckInDialogProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [attendeeData, setAttendeeData] = useState<Map<string, AttendeeFormData>>(new Map());
  const [submitting, setSubmitting] = useState(false);

  // Known relationship types from ATTENDEE_TYPES
  const FATHER = ATTENDEE_TYPES[0].value; // 父亲
  const MOTHER = ATTENDEE_TYPES[1].value; // 母亲
  const GUARDIAN = ATTENDEE_TYPES[2].value; // 监护人

  // Auto-fill helper: get guardian data for a given type
  const getAutoFillData = useCallback(
    (type: string): AttendeeFormData => {
      if (type === FATHER) {
        if (family.guardian1_relationship === FATHER) {
          return { name: family.guardian1_name, ic: family.guardian1_ic, relationship: FATHER };
        }
        if (family.guardian2_relationship === FATHER) {
          return { name: family.guardian2_name ?? "", ic: family.guardian2_ic ?? "", relationship: FATHER };
        }
        return { name: "", ic: "", relationship: FATHER };
      }

      if (type === MOTHER) {
        if (family.guardian2_relationship === MOTHER) {
          return { name: family.guardian2_name ?? "", ic: family.guardian2_ic ?? "", relationship: MOTHER };
        }
        if (family.guardian1_relationship === MOTHER) {
          return { name: family.guardian1_name, ic: family.guardian1_ic, relationship: MOTHER };
        }
        return { name: "", ic: "", relationship: MOTHER };
      }

      if (type === GUARDIAN) {
        if (
          family.guardian1_relationship &&
          family.guardian1_relationship !== FATHER &&
          family.guardian1_relationship !== MOTHER
        ) {
          return { name: family.guardian1_name, ic: family.guardian1_ic, relationship: family.guardian1_relationship };
        }
        if (
          family.guardian2_relationship &&
          family.guardian2_relationship !== FATHER &&
          family.guardian2_relationship !== MOTHER
        ) {
          return { name: family.guardian2_name ?? "", ic: family.guardian2_ic ?? "", relationship: family.guardian2_relationship };
        }
        return { name: "", ic: "", relationship: GUARDIAN };
      }

      // 其他
      return { name: "", ic: "", relationship: "" };
    },
    [family, FATHER, MOTHER, GUARDIAN]
  );

  // Reset form when dialog closes; pre-select types with stored guardian data when opening
  useEffect(() => {
    if (!open) {
      setSelectedTypes(new Set());
      setAttendeeData(new Map());
      return;
    }

    // Auto-pre-select attendee types that have stored guardian data
    const preSelected = new Set<string>();
    const preData = new Map<string, AttendeeFormData>();

    for (const type of ATTENDEE_TYPES) {
      const autoFill = getAutoFillData(type.value);
      if (autoFill.name.trim()) {
        preSelected.add(type.value);
        preData.set(type.value, autoFill);
      }
    }

    if (preSelected.size > 0) {
      setSelectedTypes(preSelected);
      setAttendeeData(preData);
    }
  }, [open, getAutoFillData]);

  function handleToggleType(type: string, checked: boolean) {
    if (checked) {
      setSelectedTypes((prev) => new Set(prev).add(type));
      setAttendeeData((prevData) => {
        const nextData = new Map(prevData);
        nextData.set(type, getAutoFillData(type));
        return nextData;
      });
    } else {
      setSelectedTypes((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
      setAttendeeData((prevData) => {
        const nextData = new Map(prevData);
        nextData.delete(type);
        return nextData;
      });
    }
  }

  function updateAttendeeField(type: string, field: keyof AttendeeFormData, value: string) {
    setAttendeeData((prev) => {
      const next = new Map(prev);
      const current = next.get(type) ?? { name: "", ic: "", relationship: "" };
      next.set(type, { ...current, [field]: value });
      return next;
    });
  }

  async function handleConfirm() {
    if (selectedTypes.size === 0) {
      toast.error("请至少选择一个出席者类型");
      return;
    }

    // Validate: all selected types need a name
    for (const type of selectedTypes) {
      const data = attendeeData.get(type);
      if (!data?.name.trim()) {
        toast.error(`请输入${type}的姓名`);
        return;
      }
    }

    // Build attendees array
    const attendees: AttendeeEntry[] = [];
    for (const type of ATTENDEE_TYPES) {
      if (selectedTypes.has(type.value)) {
        const data = attendeeData.get(type.value)!;
        attendees.push({
          type: type.value,
          name: data.name.trim(),
          ic: data.ic.trim(),
          relationship: data.relationship.trim(),
        });
      }
    }

    // First attendee used for legacy columns
    const first = attendees[0];

    setSubmitting(true);

    const supabase = createClient();
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

    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("该家庭已签到");
      } else {
        console.error("Check-in error:", error);
        toast.error("签到失败，请重试");
      }
      return;
    }

    onOpenChange(false);
    toast.success("签到成功");
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>家庭签到</DialogTitle>
          <DialogDescription>
            为 {family.guardian1_name} 的家庭进行签到
          </DialogDescription>
        </DialogHeader>

        <div className="touch-manipulation space-y-3 py-2">
          <p className="text-sm font-medium">选择出席者（可多选）</p>

          {ATTENDEE_TYPES.map((type) => {
            const isSelected = selectedTypes.has(type.value);
            const data = attendeeData.get(type.value);

            return (
              <div key={type.value} className="space-y-2">
                {/* Checkbox row */}
                <label
                  className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 active:scale-[0.98] ${
                    isSelected
                      ? "border-primary/30 bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      handleToggleType(type.value, checked === true)
                    }
                    className="size-5"
                  />
                  <span className={isSelected ? "font-medium" : ""}>
                    {type.label}
                  </span>
                  {isSelected && data?.name && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {data.name}
                    </span>
                  )}
                </label>

                {/* Expanded fields when selected */}
                {isSelected && data && (
                  <div className="ml-4 space-y-2 border-l-2 border-primary/20 pl-4">
                    <div className="space-y-1">
                      <label htmlFor={`attendee-name-${type.value}`} className="text-xs font-medium text-muted-foreground">
                        姓名 <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id={`attendee-name-${type.value}`}
                        value={data.name}
                        onChange={(e) =>
                          updateAttendeeField(type.value, "name", e.target.value)
                        }
                        placeholder="出席者姓名"
                        className="min-h-[40px] text-sm"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`attendee-ic-${type.value}`} className="text-xs font-medium text-muted-foreground">
                        身份证号码
                      </label>
                      <Input
                        id={`attendee-ic-${type.value}`}
                        value={data.ic}
                        onChange={(e) =>
                          updateAttendeeField(type.value, "ic", e.target.value)
                        }
                        placeholder="身份证号码（选填）"
                        className="min-h-[40px] text-sm"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    </div>
                    {type.value === "其他" && (
                      <div className="space-y-1">
                        <label htmlFor={`attendee-rel-${type.value}`} className="text-xs font-medium text-muted-foreground">
                          关系
                        </label>
                        <Input
                          id={`attendee-rel-${type.value}`}
                          value={data.relationship}
                          onChange={(e) =>
                            updateAttendeeField(type.value, "relationship", e.target.value)
                          }
                          placeholder="与学生的关系（选填）"
                          className="min-h-[40px] text-sm"
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={submitting || selectedTypes.size === 0}
            className="min-h-[48px] w-full text-base"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            确认签到
            {selectedTypes.size > 0 && (
              <span className="ml-1 text-sm opacity-70">
                ({selectedTypes.size}人)
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
