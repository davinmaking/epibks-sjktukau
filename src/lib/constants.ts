export const ATTENDEE_TYPES = [
  { value: "父亲", label: "父亲" },
  { value: "母亲", label: "母亲" },
  { value: "监护人", label: "监护人" },
  { value: "其他", label: "其他" },
] as const;

export const EVENT_STATUSES = ["upcoming", "ongoing", "completed"] as const;

export const ROLES = ["admin", "teacher"] as const;

export const CLASS_NAMES = [
  "PRASEKOLAH SJK TUKAU",
  "JOYFUL",
  "SUNSHINE",
  "BERDIKARI",
  "KREATIF",
  "BERJUANG",
  "SABAR",
  "BERJAYA",
  "TEKUN",
] as const;

// Maps class_name to year_level for grouping
export const CLASS_YEAR_MAP: Record<string, string> = {
  "PRASEKOLAH SJK TUKAU": "PRASEKOLAH",
  "JOYFUL": "TAHUN 1",
  "SUNSHINE": "TAHUN 2",
  "BERDIKARI": "TAHUN 3",
  "KREATIF": "TAHUN 4",
  "BERJUANG": "TAHUN 5",
  "SABAR": "TAHUN 5",
  "BERJAYA": "TAHUN 6",
  "TEKUN": "TAHUN 6",
};
