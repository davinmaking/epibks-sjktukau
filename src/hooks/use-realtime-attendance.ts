import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

type FamilyAttendance = Tables<"family_attendance">;
type StudentAttendance = Tables<"student_attendance">;

interface UseRealtimeAttendanceResult {
  familyAttendance: FamilyAttendance[];
  studentAttendance: StudentAttendance[];
  isLoading: boolean;
}

export function useRealtimeAttendance(
  eventId: string | null
): UseRealtimeAttendanceResult {
  const [familyAttendance, setFamilyAttendance] = useState<
    FamilyAttendance[]
  >([]);
  const [studentAttendance, setStudentAttendance] = useState<
    StudentAttendance[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!eventId) {
      setFamilyAttendance([]);
      setStudentAttendance([]);
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function fetchInitialData() {
      setIsLoading(true);

      const [familyResult, studentResult] = await Promise.all([
        supabase
          .from("family_attendance")
          .select("*")
          .eq("event_id", eventId!),
        supabase
          .from("student_attendance")
          .select("*")
          .eq("event_id", eventId!),
      ]);

      if (cancelled) return;

      if (familyResult.data) {
        setFamilyAttendance(familyResult.data);
      }
      if (studentResult.data) {
        setStudentAttendance(studentResult.data);
      }

      setIsLoading(false);
    }

    fetchInitialData();

    const channel = supabase
      .channel(`attendance-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "family_attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newRecord = payload.new as FamilyAttendance;
          setFamilyAttendance((prev) => [...prev, newRecord]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "family_attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setFamilyAttendance((prev) =>
            prev.filter((item) => item.id !== deletedId)
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "family_attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const updated = payload.new as FamilyAttendance;
          setFamilyAttendance((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const newRecord = payload.new as StudentAttendance;
          setStudentAttendance((prev) => [...prev, newRecord]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "student_attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setStudentAttendance((prev) =>
            prev.filter((item) => item.id !== deletedId)
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "student_attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const updated = payload.new as StudentAttendance;
          setStudentAttendance((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return { familyAttendance, studentAttendance, isLoading };
}
