"use client";

import { MetricCard, VehicleCard } from "@repo/ui";
import { useVehicleStats, useUpcomingVehicles, useBestCTVehicles } from "@repo/api-client";
import { APP_CONFIG } from "@/lib/config";
import { Car, Calendar, CheckCircle, AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useVehicleStats();
  const { data: upcoming, isLoading: upcomingLoading } = useUpcomingVehicles(4);
  const { data: bestCT, isLoading: bestCTLoading } = useBestCTVehicles(3, 4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{APP_CONFIG.name}</h1>
        <p className="text-gray-500">
          Enchères de véhicules - {APP_CONFIG.region}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total véhicules"
          value={stats?.total ?? "-"}
          icon={<Car size={24} />}
        />
        <MetricCard
          title="Prochaines ventes"
          value={stats?.upcoming ?? "-"}
          icon={<Calendar size={24} />}
        />
        <MetricCard
          title="Avec CT"
          value={stats?.withCT ?? "-"}
          icon={<CheckCircle size={24} />}
        />
        <MetricCard
          title="Défauts moyens"
          value={stats?.averageDefects?.toFixed(1) ?? "-"}
          icon={<AlertTriangle size={24} />}
        />
      </div>

      {/* Best CT vehicles */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Meilleurs CT (moins de défauts)
          </h2>
          <a href="/vehicles?maxDefects=3" className="text-sm text-primary-600 hover:text-primary-700">
            Voir tout →
          </a>
        </div>
        {bestCTLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {bestCT?.data.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                auction={vehicle}
                locale={APP_CONFIG.locale}
                currency={APP_CONFIG.currency}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Prochaines enchères</h2>
          <a href="/vehicles" className="text-sm text-primary-600 hover:text-primary-700">
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
            {upcoming?.data.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                auction={vehicle}
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
