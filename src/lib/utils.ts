import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateWithWeekday(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Shared status color utility for attendance rates
export function getStatusColors(percentage: number): {
  text: string;
  textDark: string;
  bg: string;
  bgDark: string;
  indicator: string;
  label: string;
} {
  if (percentage >= 75) {
    return {
      text: "text-success",
      textDark: "",
      bg: "bg-success/5",
      bgDark: "",
      indicator: "[&_[data-slot=progress-indicator]]:bg-success",
      label: "良好",
    };
  }
  if (percentage >= 50) {
    return {
      text: "text-yellow-700",
      textDark: "dark:text-yellow-400",
      bg: "bg-yellow-50",
      bgDark: "dark:bg-yellow-950/20",
      indicator: "[&_[data-slot=progress-indicator]]:bg-yellow-600",
      label: "一般",
    };
  }
  return {
    text: "text-destructive",
    textDark: "",
    bg: "bg-destructive/5",
    bgDark: "",
    indicator: "[&_[data-slot=progress-indicator]]:bg-destructive",
    label: "需关注",
  };
}
