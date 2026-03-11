import { useMemo } from "react";
import { CLASS_YEAR_MAP } from "@/lib/constants";
import type { Tables } from "@/lib/types";

type FamilyAttendance = Tables<"family_attendance">;
type StudentAttendance = Tables<"student_attendance">;

export interface ClassStat {
  className: string;
  yearLevel: string;
  totalFamilies: number;
  checkedInFamilies: number;
  familyRate: number;
  totalStudents: number;
  checkedInStudents: number;
  studentRate: number;
}

export interface YearLevelStat {
  yearLevel: string;
  totalFamilies: number;
  checkedInFamilies: number;
  familyRate: number;
  totalStudents: number;
  checkedInStudents: number;
  studentRate: number;
}

export interface OverallStats {
  totalFamilies: number;
  checkedInFamilies: number;
  familyRate: number;
  totalStudents: number;
  checkedInStudents: number;
  studentRate: number;
}

interface UseAttendanceStatsParams {
  familyAttendance: FamilyAttendance[];
  studentAttendance: StudentAttendance[];
  students: { class_name: string; family_id: string | null; id?: string }[];
  classFilter?: string | null;
}

export function useAttendanceStats(params: UseAttendanceStatsParams): {
  classStats: ClassStat[];
  yearLevelStats: YearLevelStat[];
  overallStats: OverallStats;
} {
  const { familyAttendance, studentAttendance, students, classFilter } = params;

  return useMemo(() => {
    // Build a map of student_id -> class_name for lookup
    const studentClassMap = new Map<string, string>();
    for (const s of students) {
      if (s.id) {
        studentClassMap.set(s.id, s.class_name);
      }
    }

    // Count unique families per class from students
    const classFamilyIds = new Map<string, Set<string>>();
    // Count students per class
    const classStudentCount = new Map<string, number>();

    for (const student of students) {
      const cls = student.class_name;

      // Student count
      classStudentCount.set(cls, (classStudentCount.get(cls) ?? 0) + 1);

      // Family count (unique family_ids per class)
      if (student.family_id) {
        if (!classFamilyIds.has(cls)) {
          classFamilyIds.set(cls, new Set());
        }
        classFamilyIds.get(cls)!.add(student.family_id);
      }
    }

    // Count checked-in families per class from familyAttendance
    const checkedInFamiliesPerClass = new Map<string, Set<string>>();
    for (const fa of familyAttendance) {
      const cls = fa.class_name;
      if (!checkedInFamiliesPerClass.has(cls)) {
        checkedInFamiliesPerClass.set(cls, new Set());
      }
      checkedInFamiliesPerClass.get(cls)!.add(fa.family_id);
    }

    // Count checked-in students per class from studentAttendance
    const checkedInStudentsPerClass = new Map<string, number>();
    for (const sa of studentAttendance) {
      const cls = studentClassMap.get(sa.student_id);
      if (cls) {
        checkedInStudentsPerClass.set(
          cls,
          (checkedInStudentsPerClass.get(cls) ?? 0) + 1
        );
      }
    }

    // Get all class names
    const allClasses = new Set<string>();
    for (const student of students) {
      allClasses.add(student.class_name);
    }

    // Build class stats
    let classStats: ClassStat[] = [];
    for (const cls of allClasses) {
      const yearLevel = CLASS_YEAR_MAP[cls] ?? cls;
      const totalFamilies = classFamilyIds.get(cls)?.size ?? 0;
      const checkedInFamilies = checkedInFamiliesPerClass.get(cls)?.size ?? 0;
      const totalStudents = classStudentCount.get(cls) ?? 0;
      const checkedInStudents = checkedInStudentsPerClass.get(cls) ?? 0;

      classStats.push({
        className: cls,
        yearLevel,
        totalFamilies,
        checkedInFamilies,
        familyRate: totalFamilies > 0 ? checkedInFamilies / totalFamilies : 0,
        totalStudents,
        checkedInStudents,
        studentRate:
          totalStudents > 0 ? checkedInStudents / totalStudents : 0,
      });
    }

    // Apply class filter
    if (classFilter) {
      classStats = classStats.filter((s) => s.className === classFilter);
    }

    // Group by year level
    const yearLevelMap = new Map<
      string,
      {
        totalFamilies: number;
        checkedInFamilies: number;
        totalStudents: number;
        checkedInStudents: number;
      }
    >();

    for (const cs of classStats) {
      const existing = yearLevelMap.get(cs.yearLevel);
      if (existing) {
        existing.totalFamilies += cs.totalFamilies;
        existing.checkedInFamilies += cs.checkedInFamilies;
        existing.totalStudents += cs.totalStudents;
        existing.checkedInStudents += cs.checkedInStudents;
      } else {
        yearLevelMap.set(cs.yearLevel, {
          totalFamilies: cs.totalFamilies,
          checkedInFamilies: cs.checkedInFamilies,
          totalStudents: cs.totalStudents,
          checkedInStudents: cs.checkedInStudents,
        });
      }
    }

    const yearLevelStats: YearLevelStat[] = [];
    for (const [yearLevel, data] of yearLevelMap) {
      yearLevelStats.push({
        yearLevel,
        totalFamilies: data.totalFamilies,
        checkedInFamilies: data.checkedInFamilies,
        familyRate:
          data.totalFamilies > 0
            ? data.checkedInFamilies / data.totalFamilies
            : 0,
        totalStudents: data.totalStudents,
        checkedInStudents: data.checkedInStudents,
        studentRate:
          data.totalStudents > 0
            ? data.checkedInStudents / data.totalStudents
            : 0,
      });
    }

    // Overall stats — count unique families across all classes (not sum per-class)
    const allUniqueFamilyIds = new Set<string>();
    for (const student of students) {
      if (student.family_id) {
        allUniqueFamilyIds.add(student.family_id);
      }
    }

    const allCheckedInFamilyIds = new Set<string>();
    for (const fa of familyAttendance) {
      allCheckedInFamilyIds.add(fa.family_id);
    }

    const totalStudentsOverall = classStats.reduce((sum, cs) => sum + cs.totalStudents, 0);
    const checkedInStudentsOverall = classStats.reduce((sum, cs) => sum + cs.checkedInStudents, 0);

    const overallStats: OverallStats = {
      totalFamilies: allUniqueFamilyIds.size,
      checkedInFamilies: allCheckedInFamilyIds.size,
      familyRate: allUniqueFamilyIds.size > 0
        ? allCheckedInFamilyIds.size / allUniqueFamilyIds.size
        : 0,
      totalStudents: totalStudentsOverall,
      checkedInStudents: checkedInStudentsOverall,
      studentRate: totalStudentsOverall > 0
        ? checkedInStudentsOverall / totalStudentsOverall
        : 0,
    };

    return { classStats, yearLevelStats, overallStats };
  }, [familyAttendance, studentAttendance, students, classFilter]);
}
