"use client";

import { useCallback, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

interface ImportResults {
  familiesCreated: number;
  familiesUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  totalRows: number;
  errors: string[];
}

export default function ImportStudentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      setError("仅支持 .xlsx 或 .xls 格式的文件");
      return;
    }
    setFile(f);
    setError(null);
    setResults(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "导入失败");
        return;
      }

      setResults(data as ImportResults);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setResults(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">导入学生数据</h1>
        <p className="text-muted-foreground">
          上传 APDM 导出的 Excel 文件，系统将自动导入学生和家庭信息
        </p>
      </div>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle>选择文件</CardTitle>
          <CardDescription>支持 .xlsx 或 .xls 格式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">
              拖拽文件到此处，或点击选择文件
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              仅支持 Excel 文件 (.xlsx, .xls)
            </p>
          </div>

          {/* Selected file display */}
          {file && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Upload button */}
          <Button
            onClick={handleUpload}
            disabled={!file || loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                开始导入
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              导入完成
            </CardTitle>
            <CardDescription>
              共处理 {results.totalRows} 条记录
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-success">
                  {results.familiesCreated}
                </p>
                <p className="text-xs text-muted-foreground">新建家庭</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-chart-2">
                  {results.familiesUpdated}
                </p>
                <p className="text-xs text-muted-foreground">更新家庭</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-success">
                  {results.studentsCreated}
                </p>
                <p className="text-xs text-muted-foreground">新建学生</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold text-chart-2">
                  {results.studentsUpdated}
                </p>
                <p className="text-xs text-muted-foreground">更新学生</p>
              </div>
            </div>

            {/* Errors list */}
            {results.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  错误 ({results.errors.length}):
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  {results.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">
                      {err}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
