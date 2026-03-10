"use client";

import { Progress } from "@/components/ui/progress";

interface ClassProgressBarProps {
  className: string;
  checkedIn: number;
  total: number;
}

function getProgressColorClass(percentage: number): {
  text: string;
  indicator: string;
} {
  if (percentage > 75) {
    return {
      text: "text-green-600",
      indicator:
        "[&_[data-slot=progress-indicator]]:bg-green-600",
    };
  }
  if (percentage > 50) {
    return {
      text: "text-yellow-600",
      indicator:
        "[&_[data-slot=progress-indicator]]:bg-yellow-600",
    };
  }
  return {
    text: "text-red-600",
    indicator:
      "[&_[data-slot=progress-indicator]]:bg-red-600",
  };
}

export function ClassProgressBar({
  className,
  checkedIn,
  total,
}: ClassProgressBarProps) {
  const percentage = total > 0 ? (checkedIn / total) * 100 : 0;
  const colors = getProgressColorClass(percentage);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{className}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {checkedIn}/{total}
          </span>
          <span className={`font-medium ${colors.text}`}>
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
      <Progress value={percentage} className={colors.indicator} />
    </div>
  );
}
