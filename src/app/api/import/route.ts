import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLASS_YEAR_MAP } from "@/lib/constants";

// Excel column indices (0-based) from the APDM spreadsheet
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
} as const;

/** Pad IC number to 12 digits (Malaysian IC numbers) */
function formatIC(value: unknown): string | null {
  if (value == null || value === "") return null;
  const str = String(value).replace(/\D/g, "");
  if (str.length === 0) return null;
  return str.padStart(12, "0");
}

/** Clean and return string or null */
function toStr(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

/** Parse date string from Excel (DD-MM-YYYY format) to ISO date */
function parseDate(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  const str = String(value).trim();
  // Try DD-MM-YYYY format
  const match = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

/** Build address from multiple fields */
function buildAddress(row: unknown[]): string | null {
  const parts = [
    toStr(row[COL.ALAMAT1]),
    toStr(row[COL.ALAMAT2]),
    toStr(row[COL.ALAMAT3]),
    toStr(row[COL.POSKOD]) ? String(row[COL.POSKOD]) : null,
    toStr(row[COL.BANDAR]),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Map JANTINA to standard format */
function mapGender(value: unknown): string | null {
  const str = toStr(value);
  if (!str) return null;
  if (str === "LELAKI") return "LELAKI";
  if (str === "PEREMPUAN") return "PEREMPUAN";
  return str;
}

/** Map HUBUNGAN to Chinese */
function mapRelationship(value: unknown): string | null {
  const str = toStr(value);
  if (!str) return null;
  const map: Record<string, string> = {
    "BAPA KANDUNG": "父亲",
    "IBU KANDUNG": "母亲",
    "BAPA TIRI": "继父",
    "IBU TIRI": "继母",
    "DATUK": "祖父",
    "NENEK": "祖母",
    "PENJAGA": "监护人",
  };
  return map[str] || str;
}

// Header row index in the spreadsheet
const HEADER_ROW_INDEX = 5;

export async function POST(request: Request) {
  try {
    // 1. Verify authentication via server client
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    // Check if user is admin
    const { data: teacher } = await supabase
      .from("teachers")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!teacher || teacher.role !== "admin") {
      return NextResponse.json({ error: "仅管理员可执行导入" }, { status: 403 });
    }

    // 2. Parse uploaded file
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "仅支持 .xlsx 或 .xls 格式" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
    }) as unknown[][];

    // Find header row and data rows
    const headerRow = allRows[HEADER_ROW_INDEX];
    if (!headerRow || !String(headerRow[0]).includes("BIL")) {
      return NextResponse.json(
        { error: "无法识别表格格式，请确认是APDM导出的学生名单" },
        { status: 400 }
      );
    }

    const dataRows = allRows.slice(HEADER_ROW_INDEX + 1).filter((row) => {
      // Skip empty rows - check BIL column has a number
      const bil = row[COL.BIL];
      return bil != null && !isNaN(Number(bil));
    });

    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: "未找到有效的学生数据行" },
        { status: 400 }
      );
    }

    // 3. Process data with admin client (bypasses RLS)
    const admin = createAdminClient();

    const results = {
      familiesCreated: 0,
      familiesUpdated: 0,
      studentsCreated: 0,
      studentsUpdated: 0,
      totalRows: dataRows.length,
      errors: [] as string[],
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + HEADER_ROW_INDEX + 2; // 1-based row in Excel (header + 1-indexed)
      const studentName = toStr(row[COL.NAMA]) || `第${rowNum}行`;

      try {
        // --- Family processing ---
        const guardian1IC = formatIC(row[COL.PENJAGA1_IC]);
        const guardian1Name = toStr(row[COL.PENJAGA1_NAMA]);

        let familyId: string | null = null;

        if (guardian1IC && guardian1Name) {
          // Check if family already exists by guardian1_ic
          const { data: existingFamily } = await admin
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
            // Update family record
            const { error: updateErr } = await admin
              .from("families")
              .update(familyData)
              .eq("id", existingFamily.id);

            if (updateErr) {
              results.errors.push(
                `${studentName}: 更新家庭记录失败 - ${updateErr.message}`
              );
            } else {
              results.familiesUpdated++;
            }
            familyId = existingFamily.id;
          } else {
            // Create family record
            const { data: newFamily, error: createErr } = await admin
              .from("families")
              .insert(familyData)
              .select("id")
              .single();

            if (createErr) {
              results.errors.push(
                `${studentName}: 创建家庭记录失败 - ${createErr.message}`
              );
            } else {
              results.familiesCreated++;
              familyId = newFamily.id;
            }
          }
        }

        // --- Student processing ---
        const className = toStr(row[COL.NAMA_KELAS]);
        if (!className) {
          results.errors.push(`${studentName}: 缺少班级名称，跳过`);
          continue;
        }

        const studentIdApdm = row[COL.ID_MURID]
          ? String(row[COL.ID_MURID])
          : null;
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

        // Try to find existing student by student_id_apdm first, then by ic_number
        let existingStudent: { id: string } | null = null;

        if (studentIdApdm) {
          const { data } = await admin
            .from("students")
            .select("id")
            .eq("student_id_apdm", studentIdApdm)
            .maybeSingle();
          existingStudent = data;
        }

        if (!existingStudent && icNumber) {
          const { data } = await admin
            .from("students")
            .select("id")
            .eq("ic_number", icNumber)
            .maybeSingle();
          existingStudent = data;
        }

        if (existingStudent) {
          const { error: updateErr } = await admin
            .from("students")
            .update(studentData)
            .eq("id", existingStudent.id);

          if (updateErr) {
            results.errors.push(
              `${studentName}: 更新学生记录失败 - ${updateErr.message}`
            );
          } else {
            results.studentsUpdated++;
          }
        } else {
          const { error: createErr } = await admin
            .from("students")
            .insert(studentData);

          if (createErr) {
            results.errors.push(
              `${studentName}: 创建学生记录失败 - ${createErr.message}`
            );
          } else {
            results.studentsCreated++;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push(`${studentName}: 处理失败 - ${message}`);
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `导入失败: ${message}` },
      { status: 500 }
    );
  }
}
