"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStatusColors } from "@/lib/utils";

interface AttendanceStatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  percentage?: number;
}

export function AttendanceStatsCard({
  title,
  value,
  description,
  percentage,
}: AttendanceStatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{value}</span>
          {percentage !== undefined && (
            <span className={`text-sm font-medium ${getStatusColors(percentage).text} ${getStatusColors(percentage).textDark}`}>
              {Math.round(percentage)}%
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
