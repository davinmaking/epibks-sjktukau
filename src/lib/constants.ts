export interface AttendeeEntry {
  type: string;
  name: string;
  ic: string;
  relationship: string;
}

export const ATTENDEE_TYPES = [
  { value: "父亲", label: "父亲" },
  { value: "母亲", label: "母亲" },
  { value: "监护人", label: "监护人" },
  { value: "其他", label: "其他" },
] as const;

export const ROLES = ["admin", "teacher"] as const;

export const CLASS_NAMES = [
  "PRASEKOLAH",
  "JOYFUL",
  "SUNSHINE",
  "T1 TEKUN",
  "T2 KREATIF",
  "T3 BERDIKARI",
  "T4 BERJUANG",
  "T5 SABAR",
  "T6 BERJAYA",
] as const;

// Maps class_name to year_level for grouping
export const CLASS_YEAR_MAP: Record<string, string> = {
  PRASEKOLAH: "PRASEKOLAH",
  JOYFUL: "PRASEKOLAH",
  SUNSHINE: "PRASEKOLAH",
  "T1 TEKUN": "TAHUN 1",
  "T2 KREATIF": "TAHUN 2",
  "T3 BERDIKARI": "TAHUN 3",
  "T4 BERJUANG": "TAHUN 4",
  "T5 SABAR": "TAHUN 5",
  "T6 BERJAYA": "TAHUN 6",
};
