"use client";

import { useState } from "react";
import { PropertyCard, Pagination, TabNavigation, MetricCard } from "@repo/ui";
import { usePropertyOpportunities, usePropertyStats } from "@repo/api-client";
import { OpportunityLevel, type PaginationParams } from "@repo/types";
import { APP_CONFIG } from "@/lib/config";
import { TrendingDown, Star, Sparkles } from "lucide-react";

const tabs = [
  { id: "all", label: "Toutes", icon: <TrendingDown size={16} /> },
  { id: OpportunityLevel.GOOD, label: "Bonnes affaires", icon: <Star size={16} /> },
  { id: OpportunityLevel.EXCELLENT, label: "Excellentes", icon: <Sparkles size={16} /> },
  { id: OpportunityLevel.EXCEPTIONAL, label: "Exceptionnelles", icon: <Sparkles size={16} /> },
];

export default function OpportunitiesPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [pagination, setPagination] = useState<PaginationParams>({
    page: 1,
    limit: 12,
    sortBy: "discountPercent",
    sortOrder: "desc",
  });

  const { data: stats } = usePropertyStats();
  const { data, isLoading } = usePropertyOpportunities(pagination.limit);

  // Filter by opportunity level if tab is selected
  const filteredData = activeTab === "all"
    ? data?.data
    : data?.data.filter((a) => a.opportunityLevel === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Opportunités</h1>
        <p className="text-gray-500">
          Biens avec les meilleures décotes par rapport au marché
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Opportunités totales"
          value={stats?.opportunities ?? "-"}
          icon={<TrendingDown size={24} />}
        />
        <MetricCard
          title="Décote moyenne"
          value={stats?.averageDiscount ? `${stats.averageDiscount.toFixed(0)}%` : "-"}
          subtitle="par rapport au marché"
        />
        <MetricCard
          title="Prix moyen/m²"
          value={stats?.averagePricePerSqm ? `${stats.averagePricePerSqm.toFixed(0)} €` : "-"}
          subtitle="marché: ~8 000 €/m²"
        />
      </div>

      {/* Tabs */}
      <TabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-80 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredData?.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Aucune opportunité trouvée dans cette catégorie
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredData?.map((auction) => (
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
