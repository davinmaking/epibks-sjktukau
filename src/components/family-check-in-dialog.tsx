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

  // Auto-fill helper: get guardian data for a given type
  const getAutoFillData = useCallback(
    (type: string): AttendeeFormData => {
      if (type === "父亲") {
        if (family.guardian1_relationship === "父亲") {
          return { name: family.guardian1_name, ic: family.guardian1_ic, relationship: "父亲" };
        }
        if (family.guardian2_relationship === "父亲") {
          return { name: family.guardian2_name ?? "", ic: family.guardian2_ic ?? "", relationship: "父亲" };
        }
        return { name: "", ic: "", relationship: "父亲" };
      }

      if (type === "母亲") {
        if (family.guardian2_relationship === "母亲") {
          return { name: family.guardian2_name ?? "", ic: family.guardian2_ic ?? "", relationship: "母亲" };
        }
        if (family.guardian1_relationship === "母亲") {
          return { name: family.guardian1_name, ic: family.guardian1_ic, relationship: "母亲" };
        }
        return { name: "", ic: "", relationship: "母亲" };
      }

      if (type === "监护人") {
        if (
          family.guardian1_relationship &&
          family.guardian1_relationship !== "父亲" &&
          family.guardian1_relationship !== "母亲"
        ) {
          return { name: family.guardian1_name, ic: family.guardian1_ic, relationship: family.guardian1_relationship };
        }
        if (
          family.guardian2_relationship &&
          family.guardian2_relationship !== "父亲" &&
          family.guardian2_relationship !== "母亲"
        ) {
          return { name: family.guardian2_name ?? "", ic: family.guardian2_ic ?? "", relationship: family.guardian2_relationship };
        }
        return { name: "", ic: "", relationship: "监护人" };
      }

      // 其他
      return { name: "", ic: "", relationship: "" };
    },
    [family]
  );

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedTypes(new Set());
      setAttendeeData(new Map());
      return;
    }
  }, [open]);

  function handleToggleType(type: string, checked: boolean) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(type);
        // Auto-fill data for this type
        setAttendeeData((prevData) => {
          const nextData = new Map(prevData);
          nextData.set(type, getAutoFillData(type));
          return nextData;
        });
      } else {
        next.delete(type);
        // Remove data for this type
        setAttendeeData((prevData) => {
          const nextData = new Map(prevData);
          nextData.delete(type);
          return nextData;
        });
      }
      return next;
    });
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

    setSubmitting(true);

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

    toast.success("签到成功");
    onOpenChange(false);
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

        <div className="space-y-4 py-2">
          <p className="text-sm font-medium">选择出席者（可多选）</p>

          {ATTENDEE_TYPES.map((type) => {
            const isSelected = selectedTypes.has(type.value);
            const data = attendeeData.get(type.value);

            return (
              <div key={type.value} className="space-y-2">
                {/* Checkbox row */}
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      handleToggleType(type.value, checked === true)
                    }
                  />
                  <span className={isSelected ? "font-medium" : ""}>
                    {type.label}
                  </span>
                </label>

                {/* Expanded fields when selected */}
                {isSelected && data && (
                  <div className="ml-6 space-y-2 border-l-2 pl-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        姓名 <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={data.name}
                        onChange={(e) =>
                          updateAttendeeField(type.value, "name", e.target.value)
                        }
                        placeholder="出席者姓名"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        身份证号码
                      </label>
                      <Input
                        value={data.ic}
                        onChange={(e) =>
                          updateAttendeeField(type.value, "ic", e.target.value)
                        }
                        placeholder="身份证号码（选填）"
                        className="h-8 text-sm"
                      />
                    </div>
                    {type.value === "其他" && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          关系
                        </label>
                        <Input
                          value={data.relationship}
                          onChange={(e) =>
                            updateAttendeeField(type.value, "relationship", e.target.value)
                          }
                          placeholder="与学生的关系（选填）"
                          className="h-8 text-sm"
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
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            确认签到
            {selectedTypes.size > 0 && (
              <span className="ml-1 text-xs opacity-70">
                ({selectedTypes.size}人)
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
