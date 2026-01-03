"use client";

import { cn } from "../../lib/cn";
import { OpportunityLevel } from "@repo/types";

interface OpportunityBadgeProps {
  level: OpportunityLevel;
  discount?: number | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const levelConfig: Record<OpportunityLevel, { bg: string; text: string; label: string }> = {
  [OpportunityLevel.NONE]: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: "",
  },
  [OpportunityLevel.GOOD]: {
    bg: "bg-success-50",
    text: "text-success-600",
    label: "Bonne affaire",
  },
  [OpportunityLevel.EXCELLENT]: {
    bg: "bg-primary-50",
    text: "text-primary-600",
    label: "Excellente",
  },
  [OpportunityLevel.EXCEPTIONAL]: {
    bg: "bg-warning-50",
    text: "text-warning-600",
    label: "Exceptionnelle",
  },
};

const sizeConfig = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export function OpportunityBadge({
  level,
  discount,
  size = "md",
  showLabel = true,
}: OpportunityBadgeProps) {
  if (level === OpportunityLevel.NONE) return null;

  const config = levelConfig[level];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        config.bg,
        config.text,
        sizeConfig[size]
      )}
    >
      {discount != null && <span>-{Math.abs(discount).toFixed(0)}%</span>}
      {showLabel && config.label && <span>{config.label}</span>}
    </span>
  );
}
