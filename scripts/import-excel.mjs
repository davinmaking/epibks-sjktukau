/**
 * Temporary script to import APDM Excel data into Supabase.
 * Usage: node scripts/import-excel.mjs
 *
 * Reads the APDM spreadsheet and inserts students + families into Supabase.
 * Uses the service role key from .env.local for admin access.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Configuration ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Excel Column Indices (0-based) from APDM spreadsheet ---
const COL = {
  BIL: 0,
  ID_MURID: 1,
  NAMA: 2,
  NO_PENGENALAN: 3,
  JENIS_PENGENALAN: 4,
  TARIKH_LAHIR: 5,
  STATUS_PENGAJIAN: 6,
  NAMA_KELAS: 10,
  JANTINA: 16,
  KAUM: 17,
  AGAMA: 18,
  // Guardian 1
  PENJAGA1_NAMA: 33,
  PENJAGA1_IC: 34,
  PENJAGA1_HUBUNGAN: 36,
  PENJAGA1_TEL_BIMBIT: 42,
  // Guardian 2
  PENJAGA2_NAMA: 44,
  PENJAGA2_IC: 45,
  PENJAGA2_HUBUNGAN: 47,
  PENJAGA2_TEL_BIMBIT: 53,
  // Address
  ALAMAT1: 54,
  ALAMAT2: 55,
  ALAMAT3: 56,
  POSKOD: 57,
  BANDAR: 58,
};

const CLASS_YEAR_MAP = {
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

const CLASS_NAME_REMAP = {
  "PRASEKOLAH SJK TUKAU": "PRASEKOLAH",
  PRASEKOLAH: "PRASEKOLAH",
  JOYFUL: "JOYFUL",
  SUNSHINE: "SUNSHINE",
  TEKUN: "T1 TEKUN",
  "1 TEKUN": "T1 TEKUN",
  KREATIF: "T2 KREATIF",
  "2 KREATIF": "T2 KREATIF",
  BERDIKARI: "T3 BERDIKARI",
  "3 BERDIKARI": "T3 BERDIKARI",
  BERJUANG: "T4 BERJUANG",
  "4 BERJUANG": "T4 BERJUANG",
  SABAR: "T5 SABAR",
  "5 SABAR": "T5 SABAR",
  BERJAYA: "T6 BERJAYA",
  "6 BERJAYA": "T6 BERJAYA",
};

// --- Utility functions ---
function formatIC(value) {
  if (value == null || value === "") return null;
  const str = String(value).replace(/\D/g, "");
  if (str.length === 0) return null;
  return str.padStart(12, "0");
}

function toStr(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function parseDate(value) {
  if (value == null || String(value).trim() === "") return null;
  const str = String(value).trim();
  const match = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function buildAddress(row) {
  const parts = [
    toStr(row[COL.ALAMAT1]),
    toStr(row[COL.ALAMAT2]),
    toStr(row[COL.ALAMAT3]),
    toStr(row[COL.POSKOD]) ? String(row[COL.POSKOD]) : null,
    toStr(row[COL.BANDAR]),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function mapGender(value) {
  const str = toStr(value);
  if (!str) return null;
  if (str === "LELAKI") return "LELAKI";
  if (str === "PEREMPUAN") return "PEREMPUAN";
  return str;
}

function mapRelationship(value) {
  const str = toStr(value);
  if (!str) return null;
  const map = {
    "BAPA KANDUNG": "父亲",
    "IBU KANDUNG": "母亲",
    "BAPA TIRI": "继父",
    "IBU TIRI": "继母",
    DATUK: "祖父",
    NENEK: "祖母",
    PENJAGA: "监护人",
    ABANG: "兄长",
    KAKAK: "姐姐",
    ADIK: "弟妹",
    "BAPA SAUDARA": "叔伯",
    "IBU SAUDARA": "姑姨",
    SAUDARA: "亲属",
    "LAIN-LAIN": "其他",
  };
  return map[str] || str;
}

function remapClassName(raw) {
  const trimmed = raw.trim().toUpperCase();
  return CLASS_NAME_REMAP[trimmed] || raw.trim();
}

function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (row && row.length > 0 && String(row[0]).trim().toUpperCase().replace(/\./g, "") === "BIL") {
      return i;
    }
  }
  return -1;
}

// --- Main ---
async function main() {
  const filePath = resolve(ROOT, "YBC4103 Keseluruhan Murid as of 2026-03-10.xlsx");
  console.log(`Reading: ${filePath}`);

  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headerRowIndex = findHeaderRowIndex(allRows);
  if (headerRowIndex === -1) {
    console.error("Could not find header row (BIL column)");
    process.exit(1);
  }
  console.log(`Header row found at index ${headerRowIndex}`);

  // Print header for debugging
  const headerRow = allRows[headerRowIndex];
  console.log(`Header columns (first 20): ${headerRow.slice(0, 20).map((h, i) => `${i}:${h}`).join(" | ")}`);

  const dataRows = allRows.slice(headerRowIndex + 1).filter((row) => {
    const bil = row[COL.BIL];
    return bil != null && !isNaN(Number(bil));
  });

  console.log(`Found ${dataRows.length} student rows\n`);

  const results = {
    familiesCreated: 0,
    familiesUpdated: 0,
    studentsCreated: 0,
    studentsUpdated: 0,
    totalRows: dataRows.length,
    errors: [],
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + headerRowIndex + 2;
    const studentName = toStr(row[COL.NAMA]) || `Row ${rowNum}`;

    try {
      // --- Family processing ---
      const guardian1IC = formatIC(row[COL.PENJAGA1_IC]);
      const guardian1Name = toStr(row[COL.PENJAGA1_NAMA]);

      let familyId = null;

      if (guardian1IC && guardian1Name) {
        const { data: existingFamily } = await supabase
          .from("families")
          .select("id")
          .eq("guardian1_ic", guardian1IC)
          .maybeSingle();

        const familyData = {
          guardian1_name: guardian1Name,
          guardian1_ic: guardian1IC,
          guardian1_relationship: mapRelationship(row[COL.PENJAGA1_HUBUNGAN]),
          guardian1_phone: toStr(row[COL.PENJAGA1_TEL_BIMBIT]),
          guardian2_name: toStr(row[COL.PENJAGA2_NAMA]),
          guardian2_ic: formatIC(row[COL.PENJAGA2_IC]),
          guardian2_relationship: mapRelationship(row[COL.PENJAGA2_HUBUNGAN]),
          guardian2_phone: toStr(row[COL.PENJAGA2_TEL_BIMBIT]),
          address: buildAddress(row),
        };

        if (existingFamily) {
          const { error: updateErr } = await supabase
            .from("families")
            .update(familyData)
            .eq("id", existingFamily.id);

          if (updateErr) {
            results.errors.push(`${studentName}: Family update failed - ${updateErr.message}`);
          } else {
            results.familiesUpdated++;
          }
          familyId = existingFamily.id;
        } else {
          const { data: newFamily, error: createErr } = await supabase
            .from("families")
            .insert(familyData)
            .select("id")
            .single();

          if (createErr) {
            results.errors.push(`${studentName}: Family create failed - ${createErr.message}`);
          } else {
            results.familiesCreated++;
            familyId = newFamily.id;
          }
        }
      }

      // --- Student processing ---
      const rawClassName = toStr(row[COL.NAMA_KELAS]);
      if (!rawClassName) {
        results.errors.push(`${studentName}: Missing class name, skipped`);
        continue;
      }
      const className = remapClassName(rawClassName);

      const studentIdApdm = row[COL.ID_MURID] ? String(row[COL.ID_MURID]) : null;
      const icNumber = formatIC(row[COL.NO_PENGENALAN]);

      const studentData = {
        student_id_apdm: studentIdApdm,
        name: toStr(row[COL.NAMA]) || "",
        ic_number: icNumber,
        id_type: toStr(row[COL.JENIS_PENGENALAN]),
        date_of_birth: parseDate(row[COL.TARIKH_LAHIR]),
        gender: mapGender(row[COL.JANTINA]),
        ethnicity: toStr(row[COL.KAUM]),
        religion: toStr(row[COL.AGAMA]),
        class_name: className,
        year_level: CLASS_YEAR_MAP[className] || null,
        family_id: familyId,
        status: toStr(row[COL.STATUS_PENGAJIAN]) || "BERSEKOLAH",
      };

      // Try to find existing student
      let existingStudent = null;

      if (studentIdApdm) {
        const { data } = await supabase
          .from("students")
          .select("id")
          .eq("student_id_apdm", studentIdApdm)
          .maybeSingle();
        existingStudent = data;
      }

      if (!existingStudent && icNumber) {
        const { data } = await supabase
          .from("students")
          .select("id")
          .eq("ic_number", icNumber)
          .maybeSingle();
        existingStudent = data;
      }

      if (existingStudent) {
        const { error: updateErr } = await supabase
          .from("students")
          .update(studentData)
          .eq("id", existingStudent.id);

        if (updateErr) {
          results.errors.push(`${studentName}: Student update failed - ${updateErr.message}`);
        } else {
          results.studentsUpdated++;
        }
      } else {
        const { error: createErr } = await supabase
          .from("students")
          .insert(studentData);

        if (createErr) {
          results.errors.push(`${studentName}: Student create failed - ${createErr.message}`);
        } else {
          results.studentsCreated++;
        }
      }

      // Progress
      if ((i + 1) % 20 === 0 || i === dataRows.length - 1) {
        process.stdout.write(`\r  Progress: ${i + 1}/${dataRows.length}`);
      }
    } catch (err) {
      results.errors.push(`${studentName}: ${err.message}`);
    }
  }

  console.log("\n\n=== Import Results ===");
  console.log(`Total rows processed: ${results.totalRows}`);
  console.log(`Families created: ${results.familiesCreated}`);
  console.log(`Families updated: ${results.familiesUpdated}`);
  console.log(`Students created: ${results.studentsCreated}`);
  console.log(`Students updated: ${results.studentsUpdated}`);

  if (results.errors.length > 0) {
    console.log(`\nErrors (${results.errors.length}):`);
    results.errors.forEach((e) => console.log(`  - ${e}`));
  } else {
    console.log("\nNo errors!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
