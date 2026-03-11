"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, User, Phone, MapPin } from "lucide-react";

interface Family {
  id: string;
  guardian1_name: string;
  guardian1_ic: string;
  guardian1_relationship: string | null;
  guardian1_phone: string | null;
  guardian2_name: string | null;
  guardian2_ic: string | null;
  guardian2_relationship: string | null;
  guardian2_phone: string | null;
  address: string | null;
}

interface Student {
  id: string;
  name: string;
  class_name: string;
  year_level: string | null;
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value || "-"}</span>
    </div>
  );
}

export default function FamilyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [children, setChildren] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFamily = async () => {
      const supabase = createClient();

      const [familyRes, childrenRes] = await Promise.all([
        supabase
          .from("families")
          .select("*")
          .eq("id", params.id)
          .single(),
        supabase
          .from("students")
          .select("id, name, class_name, year_level")
          .eq("family_id", params.id)
          .order("name"),
      ]);

      if (familyRes.error) {
        console.error("Failed to fetch family:", familyRes.error);
      } else {
        setFamily(familyRes.data as Family);
      }

      if (childrenRes.error) {
        console.error("Failed to fetch children:", childrenRes.error);
      } else {
        setChildren((childrenRes.data as Student[]) ?? []);
      }

      setLoading(false);
    };

    fetchFamily();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!family) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="size-4" data-icon="inline-start" />
          返回学生列表
        </Button>
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          未找到该家庭信息
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back button */}
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="size-4" data-icon="inline-start" />
        返回学生列表
      </Button>

      {/* Guardian 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" />
            监护人 1
            {family.guardian1_relationship && (
              <Badge variant="secondary">{family.guardian1_relationship}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="姓名" value={family.guardian1_name} />
          <Separator />
          <InfoRow label="身份证号" value={family.guardian1_ic} />
          <Separator />
          <InfoRow label="联系电话" value={family.guardian1_phone} />
        </CardContent>
      </Card>

      {/* Guardian 2 */}
      {family.guardian2_name && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5" />
              监护人 2
              {family.guardian2_relationship && (
                <Badge variant="secondary">{family.guardian2_relationship}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="姓名" value={family.guardian2_name} />
            <Separator />
            <InfoRow label="身份证号" value={family.guardian2_ic} />
            <Separator />
            <InfoRow label="联系电话" value={family.guardian2_phone} />
          </CardContent>
        </Card>
      )}

      {/* Address */}
      {family.address && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5" />
              住址
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{family.address}</p>
          </CardContent>
        </Card>
      )}

      {/* Children */}
      <Card>
        <CardHeader>
          <CardTitle>
            子女 ({children.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {children.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无学生记录</p>
          ) : (
            <div className="space-y-3">
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.year_level || "-"}
                    </p>
                  </div>
                  <Badge variant="outline">{child.class_name}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
