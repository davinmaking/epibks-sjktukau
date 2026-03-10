"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AttendanceStatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  percentage?: number;
}

function getPercentageColor(percentage: number): string {
  if (percentage >= 75) return "text-green-600";
  if (percentage >= 50) return "text-yellow-600";
  return "text-red-600";
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
            <span className={`text-sm font-medium ${getPercentageColor(percentage)}`}>
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
