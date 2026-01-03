"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { MetricCardWithTrend, EmptyState, formatCurrency } from "@repo/ui";
import { APP_CONFIG } from "@/lib/config";
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Eye,
  Home,
  Euro,
  ExternalLink,
  Maximize2,
} from "lucide-react";

interface Visit {
  id: string;
  city: string;
  address: string;
  price: number;
  surface: number | null;
  propertyType: string;
  auctionDate: string;
  url?: string;
}

interface CalendarDay {
  date: string;
  count: number;
  visits: Visit[];
}

interface VisitsCalendarData {
  total: number;
  days: number;
  calendar: CalendarDay[];
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [visitsData, setVisitsData] = useState<VisitsCalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch visits calendar data
  useEffect(() => {
    async function fetchVisits() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/properties/visits/calendar");
        if (res.ok) {
          const data = await res.json();
          setVisitsData(data);
        }
      } catch (err) {
        console.error("Failed to fetch visits:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchVisits();
  }, []);

  // Load view mode from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedView = localStorage.getItem("calendar-view-mode");
    if (savedView) setViewMode(savedView as "week" | "month");
  }, []);

  // Save view mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("calendar-view-mode", viewMode);
    }
  }, [viewMode]);

  const today = new Date().toISOString().split("T")[0];

  // Create a map of visits by date for easy lookup
  const visitsByDate = useMemo(() => {
    if (!visitsData?.calendar) return {};
    return visitsData.calendar.reduce((acc, day) => {
      acc[day.date] = day;
      return acc;
    }, {} as Record<string, CalendarDay>);
  }, [visitsData]);

  // Sorted dates with visits
  const datesWithVisits = useMemo(() => {
    return Object.keys(visitsByDate).sort();
  }, [visitsByDate]);

  // Get visits for selected date
  const selectedVisits = useMemo(() => {
    if (!selectedDate || !visitsByDate[selectedDate]) return [];
    return visitsByDate[selectedDate].visits;
  }, [selectedDate, visitsByDate]);

  // Generate calendar days for month view
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Adjust for Monday start
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const days: { date: string; isCurrentMonth: boolean; isToday: boolean; visitCount: number; visits: Visit[] }[] = [];

    // Previous month days
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      const dateStr = d.toISOString().split("T")[0];
      const dayData = visitsByDate[dateStr];
      days.push({
        date: dateStr,
        isCurrentMonth: false,
        isToday: dateStr === today,
        visitCount: dayData?.count || 0,
        visits: dayData?.visits || [],
      });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      const dateStr = d.toISOString().split("T")[0];
      const dayData = visitsByDate[dateStr];
      days.push({
        date: dateStr,
        isCurrentMonth: true,
        isToday: dateStr === today,
        visitCount: dayData?.count || 0,
        visits: dayData?.visits || [],
      });
    }

    // Next month days to complete grid
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = d.toISOString().split("T")[0];
      const dayData = visitsByDate[dateStr];
      days.push({
        date: dateStr,
        isCurrentMonth: false,
        isToday: dateStr === today,
        visitCount: dayData?.count || 0,
        visits: dayData?.visits || [],
      });
    }

    return days;
  }, [currentMonth, visitsByDate, today]);

  // Week view dates (next 14 days)
  const weekDays = useMemo(() => {
    const days: { date: string; visitCount: number; visits: Visit[] }[] = [];
    const start = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const dayData = visitsByDate[dateStr];
      days.push({
        date: dateStr,
        visitCount: dayData?.count || 0,
        visits: dayData?.visits || [],
      });
    }
    return days;
  }, [visitsByDate]);

  // Stats
  const stats = useMemo(() => {
    if (!visitsData) return { total: 0, days: 0, thisWeek: 0, cities: 0 };

    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    const thisWeekVisits = visitsData.calendar
      .filter(day => day.date >= todayStr && day.date <= weekEndStr)
      .reduce((sum, day) => sum + day.count, 0);

    const allCities = new Set<string>();
    visitsData.calendar.forEach(day => {
      day.visits.forEach(v => allCities.add(v.city));
    });

    return {
      total: visitsData.total,
      days: visitsData.days,
      thisWeek: thisWeekVisits,
      cities: allCities.size,
    };
  }, [visitsData]);

  const navigateMonth = (delta: number) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };

  const jumpToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(today);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(APP_CONFIG.locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(APP_CONFIG.locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendrier des Visites</h1>
          <p className="text-gray-500">Planifiez vos visites de biens aux enchères</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg bg-white">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-sm rounded-l-lg transition-colors ${
                viewMode === "week" ? "bg-primary-100 text-primary-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              2 Semaines
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 text-sm rounded-r-lg transition-colors ${
                viewMode === "month" ? "bg-primary-100 text-primary-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Mois
            </button>
          </div>

          {/* Jump to today */}
          <button
            onClick={jumpToToday}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Aujourd'hui
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardWithTrend
          title="Visites programmées"
          value={stats.total}
          icon={<Eye size={24} />}
          tooltip="Total des créneaux de visite"
        />
        <MetricCardWithTrend
          title="Jours avec visites"
          value={stats.days}
          icon={<CalendarDays size={24} />}
          tooltip="Nombre de jours distincts"
        />
        <MetricCardWithTrend
          title="Cette semaine"
          value={stats.thisWeek}
          icon={<Calendar size={24} />}
          tooltip="Visites dans les 7 prochains jours"
        />
        <MetricCardWithTrend
          title="Villes"
          value={stats.cities}
          icon={<MapPin size={24} />}
          tooltip="Nombre de villes différentes"
        />
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Chargement du calendrier...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Calendar view */}
          {viewMode === "month" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-lg font-semibold">
                  {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h2>
                <button
                  onClick={() => navigateMonth(1)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day.date)}
                    className={`p-2 min-h-[80px] rounded-lg text-left transition-colors relative ${
                      day.isCurrentMonth ? "bg-white" : "bg-gray-50"
                    } ${day.isToday ? "ring-2 ring-primary-500" : ""} ${
                      selectedDate === day.date ? "bg-primary-50" : "hover:bg-gray-100"
                    }`}
                  >
                    <span
                      className={`text-sm ${
                        day.isCurrentMonth ? "text-gray-900" : "text-gray-400"
                      } ${day.isToday ? "font-bold text-primary-600" : ""}`}
                    >
                      {new Date(day.date).getDate()}
                    </span>
                    {day.visitCount > 0 && (
                      <div className="mt-1">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          <Eye size={10} className="mr-1" />
                          {day.visitCount} visite{day.visitCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Week view - 14 days */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-7 divide-x divide-gray-200">
                {weekDays.slice(0, 7).map((day) => {
                  const date = new Date(day.date);
                  const isToday = day.date === today;
                  const isSelected = day.date === selectedDate;

                  return (
                    <button
                      key={day.date}
                      onClick={() => setSelectedDate(day.date)}
                      className={`p-3 text-center transition-colors ${
                        isSelected ? "bg-primary-50" : "hover:bg-gray-50"
                      } ${isToday ? "ring-2 ring-inset ring-primary-500" : ""}`}
                    >
                      <div className="text-xs text-gray-500 uppercase">
                        {date.toLocaleDateString(APP_CONFIG.locale, { weekday: "short" })}
                      </div>
                      <div className={`text-2xl font-bold mt-1 ${isToday ? "text-primary-600" : "text-gray-900"}`}>
                        {date.getDate()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {date.toLocaleDateString(APP_CONFIG.locale, { month: "short" })}
                      </div>
                      {day.visitCount > 0 && (
                        <div className="mt-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full">
                            {day.visitCount}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-200 grid grid-cols-7 divide-x divide-gray-200">
                {weekDays.slice(7, 14).map((day) => {
                  const date = new Date(day.date);
                  const isToday = day.date === today;
                  const isSelected = day.date === selectedDate;

                  return (
                    <button
                      key={day.date}
                      onClick={() => setSelectedDate(day.date)}
                      className={`p-3 text-center transition-colors ${
                        isSelected ? "bg-primary-50" : "hover:bg-gray-50"
                      } ${isToday ? "ring-2 ring-inset ring-primary-500" : ""}`}
                    >
                      <div className="text-xs text-gray-500 uppercase">
                        {date.toLocaleDateString(APP_CONFIG.locale, { weekday: "short" })}
                      </div>
                      <div className={`text-2xl font-bold mt-1 ${isToday ? "text-primary-600" : "text-gray-900"}`}>
                        {date.getDate()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {date.toLocaleDateString(APP_CONFIG.locale, { month: "short" })}
                      </div>
                      {day.visitCount > 0 && (
                        <div className="mt-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full">
                            {day.visitCount}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date pills for quick access */}
          {datesWithVisits.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedDate(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedDate === null
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Toutes les visites
              </button>
              {datesWithVisits.slice(0, 10).map((date) => {
                const count = visitsByDate[date]?.count || 0;
                const isToday = date === today;

                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedDate === date
                        ? "bg-primary-600 text-white"
                        : isToday
                        ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {isToday ? "Aujourd'hui" : formatShortDate(date)} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected date detail */}
          {selectedDate && visitsByDate[selectedDate] && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Eye className="text-green-600" size={20} />
                Visites du {formatDate(selectedDate)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedVisits.map((visit) => (
                  <Link
                    key={visit.id}
                    href={`/auctions/${visit.id}`}
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:border-primary-300 hover:shadow-md transition-all block"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                          <MapPin size={14} className="text-gray-400" />
                          {visit.city}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]" title={visit.address}>
                          {visit.address}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 mt-2">
                          <span className="flex items-center gap-1">
                            <Euro size={12} />
                            {formatCurrency(visit.price, "EUR")}
                          </span>
                          {visit.surface && (
                            <span className="flex items-center gap-1">
                              <Maximize2 size={12} />
                              {visit.surface} m²
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                          <Clock size={12} />
                          Vente le {new Date(visit.auctionDate).toLocaleDateString(APP_CONFIG.locale)}
                        </div>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                        {visit.propertyType}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* All visits list when no date selected */}
          {!selectedDate && visitsData && visitsData.calendar.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Toutes les visites à venir</h3>
              {visitsData.calendar.slice(0, 5).map((day) => (
                <div key={day.date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <div className="font-medium text-gray-900">{formatDate(day.date)}</div>
                    <span className="text-sm text-green-600 font-medium">{day.count} visite{day.count > 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {day.visits.map((visit) => (
                      <Link
                        key={visit.id}
                        href={`/auctions/${visit.id}`}
                        className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 block"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <Home size={18} className="text-green-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{visit.city}</div>
                            <div className="text-sm text-gray-500">{visit.propertyType} - {visit.surface ? `${visit.surface} m²` : "Surface N/C"}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-gray-900">{formatCurrency(visit.price, "EUR")}</div>
                          <div className="text-xs text-gray-500">Vente le {new Date(visit.auctionDate).toLocaleDateString(APP_CONFIG.locale)}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {visitsData.calendar.length > 5 && (
                <p className="text-center text-sm text-gray-500">
                  ... et {visitsData.calendar.length - 5} autres jours avec des visites
                </p>
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && (!visitsData || visitsData.total === 0) && (
            <EmptyState
              icon={<Calendar size={48} />}
              title="Aucune visite programmée"
              description="Les dates de visite seront affichées ici une fois les biens scrapés."
            />
          )}
        </>
      )}
    </div>
  );
}
