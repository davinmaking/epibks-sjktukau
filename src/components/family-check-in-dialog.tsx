"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATTENDEE_TYPES } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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

export function FamilyCheckInDialog({
  open,
  onOpenChange,
  family,
  eventId,
  className,
  teacherId,
  onSuccess,
}: FamilyCheckInDialogProps) {
  const [attendeeType, setAttendeeType] = useState<string>("");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeIc, setAttendeeIc] = useState("");
  const [attendeeRelationship, setAttendeeRelationship] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens or attendee type changes
  useEffect(() => {
    if (!open) {
      setAttendeeType("");
      setAttendeeName("");
      setAttendeeIc("");
      setAttendeeRelationship("");
      return;
    }
  }, [open]);

  // Auto-fill based on attendee type
  useEffect(() => {
    if (!attendeeType) {
      setAttendeeName("");
      setAttendeeIc("");
      setAttendeeRelationship("");
      return;
    }

    if (attendeeType === "父亲") {
      if (family.guardian1_relationship === "父亲") {
        setAttendeeName(family.guardian1_name);
        setAttendeeIc(family.guardian1_ic);
        setAttendeeRelationship("父亲");
      } else if (family.guardian2_relationship === "父亲") {
        setAttendeeName(family.guardian2_name ?? "");
        setAttendeeIc(family.guardian2_ic ?? "");
        setAttendeeRelationship("父亲");
      } else {
        setAttendeeName("");
        setAttendeeIc("");
        setAttendeeRelationship("父亲");
      }
    } else if (attendeeType === "母亲") {
      if (family.guardian2_relationship === "母亲") {
        setAttendeeName(family.guardian2_name ?? "");
        setAttendeeIc(family.guardian2_ic ?? "");
        setAttendeeRelationship("母亲");
      } else if (family.guardian1_relationship === "母亲") {
        setAttendeeName(family.guardian1_name);
        setAttendeeIc(family.guardian1_ic);
        setAttendeeRelationship("母亲");
      } else {
        setAttendeeName("");
        setAttendeeIc("");
        setAttendeeRelationship("母亲");
      }
    } else if (attendeeType === "监护人") {
      // Try guardian1 first
      if (
        family.guardian1_relationship &&
        family.guardian1_relationship !== "父亲" &&
        family.guardian1_relationship !== "母亲"
      ) {
        setAttendeeName(family.guardian1_name);
        setAttendeeIc(family.guardian1_ic);
        setAttendeeRelationship(family.guardian1_relationship);
      } else if (
        family.guardian2_relationship &&
        family.guardian2_relationship !== "父亲" &&
        family.guardian2_relationship !== "母亲"
      ) {
        setAttendeeName(family.guardian2_name ?? "");
        setAttendeeIc(family.guardian2_ic ?? "");
        setAttendeeRelationship(family.guardian2_relationship);
      } else {
        setAttendeeName("");
        setAttendeeIc("");
        setAttendeeRelationship("监护人");
      }
    } else if (attendeeType === "其他") {
      setAttendeeName("");
      setAttendeeIc("");
      setAttendeeRelationship("");
    }
  }, [attendeeType, family]);

  async function handleConfirm() {
    if (!attendeeType) {
      toast.error("请选择出席者类型");
      return;
    }

    if (attendeeType === "其他" && !attendeeName.trim()) {
      toast.error("请输入出席者姓名");
      return;
    }

    if (
      (attendeeType === "父亲" || attendeeType === "母亲" || attendeeType === "监护人") &&
      !attendeeName.trim()
    ) {
      toast.error("请输入出席者姓名");
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.from("family_attendance").insert({
      event_id: eventId,
      family_id: family.id,
      class_name: className,
      attendee_type: attendeeType,
      attendee_name: attendeeName.trim() || null,
      attendee_ic: attendeeIc.trim() || null,
      attendee_relationship: attendeeRelationship.trim() || null,
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

  const showNameIcFields =
    attendeeType === "父亲" ||
    attendeeType === "母亲" ||
    attendeeType === "监护人";
  const showOtherFields = attendeeType === "其他";

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
          {/* Attendee type selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">出席者类型</label>
            <Select value={attendeeType} onValueChange={(v) => setAttendeeType(v ?? "")}>
              <SelectTrigger className="w-full" autoFocus>
                <SelectValue placeholder="选择出席者类型" />
              </SelectTrigger>
              <SelectContent>
                {ATTENDEE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name & IC for 父亲/母亲/监护人 */}
          {showNameIcFields && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">姓名</label>
                <Input
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  placeholder="出席者姓名"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">身份证号码</label>
                <Input
                  value={attendeeIc}
                  onChange={(e) => setAttendeeIc(e.target.value)}
                  placeholder="身份证号码"
                />
              </div>
            </>
          )}

          {/* Fields for 其他 */}
          {showOtherFields && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  姓名 <span className="text-destructive">*</span>
                </label>
                <Input
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  placeholder="出席者姓名"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">关系</label>
                <Input
                  value={attendeeRelationship}
                  onChange={(e) => setAttendeeRelationship(e.target.value)}
                  placeholder="与学生的关系（选填）"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">身份证号码</label>
                <Input
                  value={attendeeIc}
                  onChange={(e) => setAttendeeIc(e.target.value)}
                  placeholder="身份证号码（选填）"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={submitting || !attendeeType}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            确认签到
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
