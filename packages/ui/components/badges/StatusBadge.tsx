"use client";

import { cn } from "../../lib/cn";
import { AuctionStatus } from "@repo/types";

interface StatusBadgeProps {
  status: AuctionStatus;
  size?: "sm" | "md" | "lg";
}

const statusConfig: Record<AuctionStatus, { bg: string; text: string; label: string }> = {
  [AuctionStatus.UPCOMING]: {
    bg: "bg-primary-50",
    text: "text-primary-600",
    label: "A venir",
  },
  [AuctionStatus.ACTIVE]: {
    bg: "bg-success-50",
    text: "text-success-600",
    label: "En cours",
  },
  [AuctionStatus.COMPLETED]: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: "Terminee",
  },
  [AuctionStatus.CANCELLED]: {
    bg: "bg-danger-50",
    text: "text-danger-600",
    label: "Annulee",
  },
};

const sizeConfig = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.bg,
        config.text,
        sizeConfig[size]
      )}
    >
      {config.label}
    </span>
  );
}
