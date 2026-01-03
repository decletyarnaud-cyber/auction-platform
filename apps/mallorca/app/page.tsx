"use client";

import { MetricCard, PropertyCard, formatCurrency } from "@repo/ui";
import { usePropertyStats, useUpcomingProperties, usePropertyOpportunities } from "@repo/api-client";
import { APP_CONFIG } from "@/lib/config";
import { Gavel, TrendingDown, Calendar, Home } from "lucide-react";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = usePropertyStats();
  const { data: upcoming, isLoading: upcomingLoading } = useUpcomingProperties(4);
  const { data: opportunities, isLoading: oppLoading } = usePropertyOpportunities(4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{APP_CONFIG.name}</h1>
        <p className="text-gray-500">
          Enchères immobilières judiciaires - {APP_CONFIG.region}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total enchères"
          value={stats?.total ?? "-"}
          icon={<Home size={24} />}
        />
        <MetricCard
          title="A venir"
          value={stats?.upcoming ?? "-"}
          icon={<Calendar size={24} />}
        />
        <MetricCard
          title="Opportunités"
          value={stats?.opportunities ?? "-"}
          icon={<TrendingDown size={24} />}
        />
        <MetricCard
          title="Décote moyenne"
          value={stats?.averageDiscount ? `${stats.averageDiscount.toFixed(0)}%` : "-"}
          icon={<Gavel size={24} />}
        />
      </div>

      {/* Upcoming auctions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Prochaines enchères</h2>
          <a href="/auctions" className="text-sm text-primary-600 hover:text-primary-700">
            Voir tout →
          </a>
        </div>
        {upcomingLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {upcoming?.data.map((auction) => (
              <PropertyCard
                key={auction.id}
                auction={auction}
                locale={APP_CONFIG.locale}
                currency={APP_CONFIG.currency}
              />
            ))}
          </div>
        )}
      </section>

      {/* Best opportunities */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Meilleures opportunités</h2>
          <a href="/opportunities" className="text-sm text-primary-600 hover:text-primary-700">
            Voir tout →
          </a>
        </div>
        {oppLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {opportunities?.data.map((auction) => (
              <PropertyCard
                key={auction.id}
                auction={auction}
                locale={APP_CONFIG.locale}
                currency={APP_CONFIG.currency}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
