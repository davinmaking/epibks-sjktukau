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

// Distinct colors per class for pie charts
export const CLASS_COLORS: Record<string, string> = {
  PRASEKOLAH: "oklch(0.70 0.18 145)",
  JOYFUL: "oklch(0.75 0.15 65)",
  SUNSHINE: "oklch(0.80 0.16 90)",
  "T1 TEKUN": "oklch(0.65 0.20 250)",
  "T2 KREATIF": "oklch(0.60 0.18 285)",
  "T3 BERDIKARI": "oklch(0.68 0.14 195)",
  "T4 BERJUANG": "oklch(0.70 0.16 55)",
  "T5 SABAR": "oklch(0.60 0.20 330)",
  "T6 BERJAYA": "oklch(0.55 0.15 170)",
};

export const NOT_CHECKED_IN_COLOR = "oklch(0.65 0.22 25)";

// Maps class_name to year_level for grouping
export const CLASS_YEAR_MAP: Record<string, string> = {
  PRASEKOLAH: "PRASEKOLAH",
  JOYFUL: "PPKI",
  SUNSHINE: "PPKI",
  "T1 TEKUN": "TAHUN 1",
  "T2 KREATIF": "TAHUN 2",
  "T3 BERDIKARI": "TAHUN 3",
  "T4 BERJUANG": "TAHUN 4",
  "T5 SABAR": "TAHUN 5",
  "T6 BERJAYA": "TAHUN 6",
};
