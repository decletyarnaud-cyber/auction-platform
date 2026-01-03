"use client";

import { cn } from "../../lib/cn";

interface PropertyCardSkeletonProps {
  className?: string;
  animate?: boolean;
}

export function PropertyCardSkeleton({
  className,
  animate = true,
}: PropertyCardSkeletonProps) {
  const pulseClass = animate ? "animate-pulse" : "";

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-gray-200 overflow-hidden",
        className
      )}
    >
      {/* Image placeholder */}
      <div className={cn("h-48 bg-gray-200", pulseClass)} />

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className={cn("h-5 bg-gray-200 rounded w-3/4", pulseClass)} />

        {/* Location */}
        <div className="flex items-center gap-2">
          <div className={cn("h-4 w-4 bg-gray-200 rounded", pulseClass)} />
          <div className={cn("h-4 bg-gray-200 rounded w-1/2", pulseClass)} />
        </div>

        {/* Details row */}
        <div className="flex gap-4">
          <div className={cn("h-4 bg-gray-200 rounded w-16", pulseClass)} />
          <div className={cn("h-4 bg-gray-200 rounded w-16", pulseClass)} />
        </div>

        {/* Date */}
        <div className="flex items-center gap-2">
          <div className={cn("h-4 w-4 bg-gray-200 rounded", pulseClass)} />
          <div className={cn("h-4 bg-gray-200 rounded w-24", pulseClass)} />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className={cn("h-3 bg-gray-200 rounded w-16", pulseClass)} />
            <div className={cn("h-6 bg-gray-200 rounded w-24", pulseClass)} />
          </div>
          <div className="space-y-1 text-right">
            <div className={cn("h-3 bg-gray-200 rounded w-12", pulseClass)} />
            <div className={cn("h-4 bg-gray-200 rounded w-16", pulseClass)} />
          </div>
        </div>
      </div>
    </div>
  );
}
