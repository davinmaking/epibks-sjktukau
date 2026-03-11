"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CLASS_NAMES } from "@/lib/constants";
import { Upload, Loader2 } from "lucide-react";
import Link from "next/link";

interface StudentRow {
  id: string;
  name: string;
  ic_number: string | null;
  class_name: string;
  year_level: string | null;
  family_id: string | null;
  families: { guardian1_name: string } | null;
}

const columns: ColumnDef<StudentRow>[] = [
  { key: "name", label: "姓名", sortable: true },
  { key: "ic_number", label: "身份证号", sortable: true },
  { key: "class_name", label: "班级", sortable: true },
  { key: "year_level", label: "年级", sortable: true },
  {
    key: "families.guardian1_name",
    label: "监护人",
    sortable: true,
  },
];

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState<string>("all");

  useEffect(() => {
    const fetchStudents = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("students")
        .select("id, name, ic_number, class_name, year_level, family_id, families(guardian1_name)")
        .order("class_name")
        .order("name");

      if (error) {
        console.error("Failed to fetch students:", error);
      } else {
        setStudents((data as unknown as StudentRow[]) ?? []);
      }
      setLoading(false);
    };

    fetchStudents();
  }, []);

  const filteredByClass = useMemo(() => {
    if (classFilter === "all") return students;
    return students.filter((s) => s.class_name === classFilter);
  }, [students, classFilter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="加载中">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">学生管理</h1>
          <p className="text-sm text-muted-foreground">
            共 {students.length} 名学生
          </p>
        </div>
        <Button render={<Link href="/students/import" />}>
          <Upload className="size-4" data-icon="inline-start" />
          导入数据
        </Button>
      </div>

      {/* Data Table */}
      <DataTable<StudentRow>
        columns={columns}
        data={filteredByClass}
        searchPlaceholder="搜索学生姓名或身份证号..."
        searchKeys={["name", "ic_number"]}
        pageSize={20}
        onRowClick={(row) => {
          if (row.family_id) {
            router.push(`/students/families/${row.family_id}`);
          }
        }}
        filterSlot={
          <Select
            value={classFilter}
            onValueChange={(val) => setClassFilter(val as string)}
          >
            <SelectTrigger>
              <SelectValue placeholder="所有班级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有班级</SelectItem>
              {CLASS_NAMES.map((cls) => (
                <SelectItem key={cls} value={cls}>
                  {cls}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
}
