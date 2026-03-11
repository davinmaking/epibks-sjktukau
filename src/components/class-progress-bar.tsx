"use client";

import { Progress } from "@/components/ui/progress";
import { getStatusColors } from "@/lib/utils";

interface ClassProgressBarProps {
  classLabel: string;
  checkedIn: number;
  total: number;
  colorDot?: string;
}

export function ClassProgressBar({
  classLabel,
  checkedIn,
  total,
  colorDot,
}: ClassProgressBarProps) {
  const percentage = total > 0 ? (checkedIn / total) * 100 : 0;
  const colors = getStatusColors(percentage);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          {colorDot && (
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorDot }}
            />
          )}
          {classLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${colors.text} ${colors.textDark}`}>
            {Math.round(percentage)}%
          </span>
          <span className="text-muted-foreground">
            {checkedIn}/{total}
          </span>
        </div>
      </div>
      <Progress value={percentage} className={colors.indicator} />
    </div>
  );
}
