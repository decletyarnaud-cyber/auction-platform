"use client";

import { cn } from "../../lib/cn";
import { CTResult, CTDefects } from "@repo/types";

interface CTScoreBadgeProps {
  result: CTResult | null;
  defects?: CTDefects | null;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
}

const resultConfig: Record<CTResult, { bg: string; text: string; label: string }> = {
  [CTResult.FAVORABLE]: {
    bg: "bg-success-50",
    text: "text-success-600",
    label: "Favorable",
  },
  [CTResult.MAJOR]: {
    bg: "bg-warning-50",
    text: "text-warning-600",
    label: "Defaut majeur",
  },
  [CTResult.CRITICAL]: {
    bg: "bg-danger-50",
    text: "text-danger-600",
    label: "Contre-visite",
  },
};

const sizeConfig = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export function CTScoreBadge({
  result,
  defects,
  size = "md",
  showDetails = false,
}: CTScoreBadgeProps) {
  if (!result) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full font-medium bg-gray-100 text-gray-500",
          sizeConfig[size]
        )}
      >
        Pas de CT
      </span>
    );
  }

  const config = resultConfig[result];

  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "inline-flex items-center rounded-full font-medium",
          config.bg,
          config.text,
          sizeConfig[size]
        )}
      >
        {config.label}
        {defects && <span className="ml-1">({defects.total})</span>}
      </span>
      {showDetails && defects && (
        <div className="text-xs text-gray-500">
          {defects.critical > 0 && (
            <span className="text-danger-600">{defects.critical} crit. </span>
          )}
          {defects.major > 0 && (
            <span className="text-warning-600">{defects.major} maj. </span>
          )}
          {defects.minor > 0 && (
            <span className="text-gray-600">{defects.minor} min.</span>
          )}
        </div>
      )}
    </div>
  );
}
