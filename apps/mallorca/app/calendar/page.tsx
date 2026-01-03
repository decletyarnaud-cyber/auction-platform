"use client";

import { useState } from "react";
import { MetricCard, PropertyCard } from "@repo/ui";
import { useUpcomingProperties } from "@repo/api-client";
import { APP_CONFIG } from "@/lib/config";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { data, isLoading } = useUpcomingProperties(50);

  // Group auctions by date
  const auctionsByDate = data?.data.reduce((acc, auction) => {
    if (!auction.auctionDate) return acc;
    const date = auction.auctionDate.split("T")[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(auction);
    return acc;
  }, {} as Record<string, typeof data.data>);

  const dates = Object.keys(auctionsByDate || {}).sort();
  const displayedAuctions = selectedDate
    ? auctionsByDate?.[selectedDate] || []
    : data?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calendrier</h1>
        <p className="text-gray-500">Prochaines ventes aux enchères</p>
      </div>

      {/* Date pills */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedDate(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            selectedDate === null
              ? "bg-primary-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Toutes les dates
        </button>
        {dates.map((date) => {
          const d = new Date(date);
          const label = d.toLocaleDateString(APP_CONFIG.locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          const count = auctionsByDate?.[date]?.length || 0;
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedDate === date
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Prochaines ventes"
          value={data?.data.length ?? "-"}
          icon={<Calendar size={24} />}
        />
        <MetricCard
          title="Dates de vente"
          value={dates.length}
          subtitle="jours d'audience"
        />
        <MetricCard
          title="Date sélectionnée"
          value={
            selectedDate
              ? new Date(selectedDate).toLocaleDateString(APP_CONFIG.locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : "Toutes"
          }
        />
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-80 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : displayedAuctions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Aucune vente prévue à cette date
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedAuctions.map((auction) => (
            <PropertyCard
              key={auction.id}
              auction={auction}
              locale={APP_CONFIG.locale}
              currency={APP_CONFIG.currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
