"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MetricCardWithTrend,
  PropertyCard,
  PropertyCardSkeleton,
  RecentlyViewed,
  AlertsWidget,
  CountdownTimer,
  formatCurrency,
} from "@repo/ui";
import {
  usePropertyStats,
  useUpcomingProperties,
  usePropertyOpportunities,
  useDistantProperties,
} from "@repo/api-client";
import { APP_CONFIG } from "@/lib/config";
import {
  Gavel,
  TrendingDown,
  Calendar,
  Home,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Clock,
  ArrowRight,
  Hourglass,
  MapPin,
  Building2,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = usePropertyStats(APP_CONFIG.departments);
  const { data: upcoming, isLoading: upcomingLoading, refetch: refetchUpcoming } = useUpcomingProperties(20, APP_CONFIG.departments);
  const { data: opportunities, isLoading: oppLoading, refetch: refetchOpp } = usePropertyOpportunities(8, APP_CONFIG.departments);
  const { data: distant, isLoading: distantLoading, refetch: refetchDistant } = useDistantProperties(8, APP_CONFIG.departments);

  // Filter urgent auctions (ending within 48h)
  const urgentAuctions = useMemo(() => {
    if (!upcoming?.data) return [];
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    return upcoming.data.filter((a) => {
      if (!a.auctionDate) return false;
      const date = new Date(a.auctionDate);
      return date >= now && date <= in48h;
    });
  }, [upcoming?.data]);

  // Greeting based on time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  }, []);

  // Refresh all data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStats(), refetchUpcoming(), refetchOpp(), refetchDistant()]);
    setLastRefresh(new Date());
    setIsRefreshing(false);
  };

  // Time since last refresh
  const refreshAgo = useMemo(() => {
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000 / 60);
    if (diff < 1) return "À l'instant";
    if (diff < 60) return `Il y a ${diff} min`;
    return `Il y a ${Math.floor(diff / 60)}h`;
  }, [lastRefresh]);

  return (
    <div className="space-y-6">
      {/* Header with greeting and CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting} !
          </h1>
          <p className="text-gray-500">
            {stats?.upcoming || 0} nouvelles enchères correspondent à vos critères
          </p>
        </div>

        {/* Primary CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/opportunities")}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Sparkles size={18} />
            Explorer les opportunités
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Search Perimeter Indicator */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <MapPin size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{APP_CONFIG.region}</h3>
              <p className="text-sm text-gray-500">Zone de recherche active</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {APP_CONFIG.departments.map((dept) => (
              <span
                key={dept}
                className="px-2 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200"
              >
                {dept}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Building2 size={16} />
            <span>{APP_CONFIG.courts.length} tribunaux surveillés</span>
          </div>
        </div>
      </div>

      {/* Stats with trends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardWithTrend
          title="Total enchères"
          value={stats?.total ?? "-"}
          trend={{ value: 12, label: "vs semaine dernière" }}
          icon={<Home size={24} />}
          tooltip="Nombre total de biens en vente aux enchères dans votre région"
        />
        <MetricCardWithTrend
          title="À venir"
          value={stats?.upcoming ?? "-"}
          trend={{ value: 5, label: "vs semaine dernière" }}
          icon={<Calendar size={24} />}
          tooltip="Enchères programmées dans les prochains jours"
        />
        <MetricCardWithTrend
          title="Opportunités"
          value={stats?.opportunities ?? "-"}
          trend={{ value: -3, label: "vs semaine dernière" }}
          icon={<TrendingDown size={24} />}
          tooltip="Biens avec une décote supérieure à 20% par rapport au marché"
        />
        <MetricCardWithTrend
          title="Décote moyenne"
          value={stats?.averageDiscount ? `${stats.averageDiscount.toFixed(0)}%` : "-"}
          trend={{ value: 2, label: "vs semaine dernière" }}
          icon={<Gavel size={24} />}
          tooltip="Pourcentage moyen de décote par rapport au prix du marché"
        />
      </div>

      {/* Urgent section - À ne pas manquer */}
      {urgentAuctions.length > 0 && (
        <section className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-4 border border-orange-200">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={20} className="text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              À ne pas manquer
            </h2>
            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
              {urgentAuctions.length} enchères dans moins de 48h
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {urgentAuctions.slice(0, 4).map((auction, index) => (
              <div
                key={auction.id}
                className="bg-white rounded-lg p-3 border border-orange-200 animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-gray-900 text-sm line-clamp-1">
                    {auction.address}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {auction.city}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">
                    {formatCurrency(auction.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency)}
                  </span>
                  <CountdownTimer
                    targetDate={auction.auctionDate!}
                    size="sm"
                    showIcon={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming auctions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Prochaines enchères</h2>
          <a href="/auctions" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
            Voir tout <ChevronRight size={16} />
          </a>
        </div>

        {upcomingLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {upcoming?.data.slice(0, 4).map((auction, index) => (
              <div
                key={auction.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <PropertyCard
                  auction={auction}
                  locale={APP_CONFIG.locale}
                  currency={APP_CONFIG.currency}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Best opportunities */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Meilleures opportunités</h2>
          <a href="/opportunities" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
            Voir tout <ChevronRight size={16} />
          </a>
        </div>
        {oppLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {opportunities?.data.slice(0, 4).map((auction, index) => (
              <div
                key={auction.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <PropertyCard
                  auction={auction}
                  locale={APP_CONFIG.locale}
                  currency={APP_CONFIG.currency}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Distant auctions (newest/most distant dates) */}
      <section className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hourglass size={20} className="text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Nouveautés (enchères lointaines)</h2>
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
              Dates éloignées
            </span>
          </div>
          <a href="/auctions?sortBy=auctionDate&sortOrder=desc" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
            Voir tout <ChevronRight size={16} />
          </a>
        </div>
        {distantLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : distant?.data?.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Aucune nouvelle enchère lointaine
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {distant?.data.slice(0, 4).map((auction, index) => (
              <div
                key={auction.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <PropertyCard
                  auction={auction}
                  locale={APP_CONFIG.locale}
                  currency={APP_CONFIG.currency}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bottom row: Alerts + Recently viewed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AlertsWidget
          onCreateAlert={() => router.push("/settings#alerts")}
          onEditAlert={(alert) => router.push(`/settings#alerts?edit=${alert.id}`)}
        />
        <RecentlyViewed
          locale={APP_CONFIG.locale}
          onItemClick={(property) => window.open(property.url, "_blank")}
        />
      </div>

      {/* Data freshness indicator */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
        <span>Données mises à jour {refreshAgo}</span>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-primary-600 hover:text-primary-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>
    </div>
  );
}
