"use client";

import { useMemo } from "react";
import { cn } from "../../lib/cn";

interface TimelineDay {
  date: Date;
  count: number;
  isToday?: boolean;
}

interface AuctionTimelineProps {
  auctions: Array<{ auctionDate?: string | null }>;
  days?: number;
  onDayClick?: (date: string) => void;
  selectedDate?: string | null;
  locale?: string;
}

export function AuctionTimeline({
  auctions,
  days = 7,
  onDayClick,
  selectedDate,
  locale = "fr-FR",
}: AuctionTimelineProps) {
  const timeline = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: TimelineDay[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];

      const count = auctions.filter((a) => {
        if (!a.auctionDate) return false;
        return a.auctionDate.split("T")[0] === dateStr;
      }).length;

      result.push({
        date,
        count,
        isToday: i === 0,
      });
    }

    return result;
  }, [auctions, days]);

  const maxCount = Math.max(...timeline.map((d) => d.count), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">
        Prochaines ventes (7 jours)
      </h3>
      <div className="flex items-end justify-between gap-1 h-24">
        {timeline.map((day) => {
          const dateStr = day.date.toISOString().split("T")[0];
          const isSelected = selectedDate === dateStr;
          const heightPercent = day.count > 0 ? (day.count / maxCount) * 100 : 5;

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick?.(dateStr)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 group transition-all",
                isSelected && "scale-105"
              )}
            >
              <div className="relative w-full flex justify-center">
                {day.count > 0 && (
                  <span className="absolute -top-5 text-xs font-medium text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {day.count}
                  </span>
                )}
                <div
                  className={cn(
                    "w-8 rounded-t-md transition-all",
                    day.count > 0
                      ? isSelected
                        ? "bg-primary-600"
                        : "bg-primary-200 group-hover:bg-primary-400"
                      : "bg-gray-100",
                    day.isToday && "ring-2 ring-primary-400 ring-offset-1"
                  )}
                  style={{ height: `${heightPercent}%`, minHeight: "4px" }}
                />
              </div>
              <div className="text-center">
                <p
                  className={cn(
                    "text-xs font-medium",
                    day.isToday ? "text-primary-600" : "text-gray-600",
                    isSelected && "text-primary-700"
                  )}
                >
                  {day.date.toLocaleDateString(locale, { weekday: "short" })}
                </p>
                <p className="text-xs text-gray-400">
                  {day.date.getDate()}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
