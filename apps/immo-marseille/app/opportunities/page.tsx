"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  PropertyCard,
  PropertyCardSkeleton,
  Pagination,
  TabNavigation,
  MetricCardWithTrend,
  MiniMapPreview,
  SelectFilter,
  RangeFilter,
  EmptyState,
  formatCurrency,
} from "@repo/ui";
import { usePropertyOpportunities, usePropertyStats, useProperties } from "@repo/api-client";
import { OpportunityLevel, PropertyType, type PaginationParams, type PropertyAuction } from "@repo/types";
import { APP_CONFIG } from "@/lib/config";
import {
  TrendingDown,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  Bell,
  BellOff,
  BarChart3,
  PieChart,
  MapPin,
  Download,
  ArrowUpDown,
  Filter,
  Eye,
  Clock,
} from "lucide-react";

const STORAGE_KEYS = {
  WATCHLIST: "opportunities-watchlist",
  SORT: "opportunities-sort",
};

const tabs = [
  { id: "all", label: "Toutes", icon: <TrendingDown size={16} /> },
  { id: OpportunityLevel.GOOD, label: "Bonnes affaires", icon: <Star size={16} /> },
  { id: OpportunityLevel.EXCELLENT, label: "Excellentes", icon: <Sparkles size={16} /> },
  { id: OpportunityLevel.EXCEPTIONAL, label: "Exceptionnelles", icon: <Sparkles size={16} /> },
];

const sortOptions = [
  { value: "discountPercent:desc", label: "Meilleure décote" },
  { value: "startingPrice:asc", label: "Prix (bas → haut)" },
  { value: "pricePerSqm:asc", label: "€/m² (bas → haut)" },
  { value: "auctionDate:asc", label: "Date (proche)" },
  { value: "surface:desc", label: "Surface (grand)" },
];

const propertyTypeOptions = [
  { value: PropertyType.APARTMENT, label: "Appartement" },
  { value: PropertyType.HOUSE, label: "Maison" },
  { value: PropertyType.COMMERCIAL, label: "Commercial" },
  { value: PropertyType.LAND, label: "Terrain" },
];

export default function OpportunitiesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [pagination, setPagination] = useState<PaginationParams>({
    page: 1,
    limit: 50,
    sortBy: "discountPercent",
    sortOrder: "desc",
  });
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showScoreExplainer, setShowScoreExplainer] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [selectedPropertyType, setSelectedPropertyType] = useState<PropertyType[]>([]);
  const [minSurface, setMinSurface] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [hoveredProperty, setHoveredProperty] = useState<PropertyAuction | null>(null);

  // Load watchlist from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
    if (saved) setWatchlist(new Set(JSON.parse(saved)));
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify([...watchlist]));
    }
  }, [watchlist]);

  const { data: stats } = usePropertyStats();
  const { data, isLoading } = usePropertyOpportunities(pagination.limit);

  // Filter and sort data
  const filteredData = useMemo(() => {
    if (!data?.data) return [];

    let result = data.data;

    // Filter by tab
    if (activeTab !== "all") {
      result = result.filter((a) => a.opportunityLevel === activeTab);
    }

    // Filter by property type
    if (selectedPropertyType.length > 0) {
      result = result.filter((a) => selectedPropertyType.includes(a.propertyType as PropertyType));
    }

    // Filter by min surface
    if (minSurface) {
      result = result.filter((a) => a.surface && a.surface >= minSurface);
    }

    // Filter by max price
    if (maxPrice) {
      result = result.filter((a) => a.startingPrice && a.startingPrice <= maxPrice);
    }

    // Sort
    const [sortBy, sortOrder] = `${pagination.sortBy}:${pagination.sortOrder}`.split(":");
    result = [...result].sort((a, b) => {
      const aVal = a[sortBy as keyof PropertyAuction] ?? 0;
      const bVal = b[sortBy as keyof PropertyAuction] ?? 0;
      const multiplier = sortOrder === "desc" ? -1 : 1;
      return ((aVal as number) - (bVal as number)) * multiplier;
    });

    return result;
  }, [data?.data, activeTab, selectedPropertyType, minSurface, maxPrice, pagination.sortBy, pagination.sortOrder]);

  // Distribution stats
  const distributionStats = useMemo(() => {
    if (!data?.data) return { good: 0, excellent: 0, exceptional: 0, ranges: [] };

    const good = data.data.filter((a) => a.opportunityLevel === OpportunityLevel.GOOD).length;
    const excellent = data.data.filter((a) => a.opportunityLevel === OpportunityLevel.EXCELLENT).length;
    const exceptional = data.data.filter((a) => a.opportunityLevel === OpportunityLevel.EXCEPTIONAL).length;

    // Discount ranges
    const ranges = [
      { label: "20-30%", count: data.data.filter((a) => a.discountPercent && a.discountPercent >= 20 && a.discountPercent < 30).length },
      { label: "30-40%", count: data.data.filter((a) => a.discountPercent && a.discountPercent >= 30 && a.discountPercent < 40).length },
      { label: "40-50%", count: data.data.filter((a) => a.discountPercent && a.discountPercent >= 40 && a.discountPercent < 50).length },
      { label: "50%+", count: data.data.filter((a) => a.discountPercent && a.discountPercent >= 50).length },
    ];

    return { good, excellent, exceptional, ranges };
  }, [data?.data]);

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (value: string) => {
    const [sortBy, sortOrder] = value.split(":");
    setPagination((prev) => ({ ...prev, sortBy, sortOrder: sortOrder as "asc" | "desc" }));
    setShowSortDropdown(false);
  };

  const exportWatchlist = () => {
    if (!data?.data) return;
    const watchlistItems = data.data.filter((a) => watchlist.has(a.id));
    const csv = [
      ["Adresse", "Ville", "Prix", "Surface", "€/m²", "Décote", "Date enchère", "URL"].join(","),
      ...watchlistItems.map((a) => [
        `"${a.address}"`,
        a.city,
        a.startingPrice,
        a.surface,
        a.pricePerSqm,
        a.discountPercent ? `${a.discountPercent}%` : "",
        a.auctionDate,
        a.url,
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `watchlist-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const activeFiltersCount = [
    selectedPropertyType.length > 0,
    minSurface !== undefined,
    maxPrice !== undefined,
  ].filter(Boolean).length;

  const currentSort = `${pagination.sortBy}:${pagination.sortOrder}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opportunités</h1>
          <p className="text-gray-500">
            {filteredData.length} bien{filteredData.length > 1 ? "s" : ""} avec décote significative
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Watchlist export */}
          {watchlist.size > 0 && (
            <button
              onClick={exportWatchlist}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Download size={18} />
              Exporter ({watchlist.size})
            </button>
          )}

          {/* Distribution toggle */}
          <button
            onClick={() => setShowDistribution(!showDistribution)}
            className={`p-2 rounded-lg transition-colors ${
              showDistribution ? "bg-primary-100 text-primary-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title="Distribution des décotes"
          >
            <BarChart3 size={18} />
          </button>

          {/* Score explainer */}
          <button
            onClick={() => setShowScoreExplainer(true)}
            className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
            title="Comment est calculé le score ?"
          >
            <Info size={18} />
          </button>
        </div>
      </div>

      {/* Stats with trends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardWithTrend
          title="Opportunités totales"
          value={stats?.opportunities ?? "-"}
          trend={{ value: 8, label: "vs semaine dernière" }}
          icon={<TrendingDown size={24} />}
          tooltip="Biens avec décote > 20% par rapport au prix du marché"
        />
        <MetricCardWithTrend
          title="Décote moyenne"
          value={stats?.averageDiscount ? `${stats.averageDiscount.toFixed(0)}%` : "-"}
          trend={{ value: 2, label: "vs semaine dernière" }}
          icon={<PieChart size={24} />}
          tooltip="Écart moyen entre prix enchère et estimation marché"
        />
        <MetricCardWithTrend
          title="Prix moyen/m²"
          value={stats?.averagePricePerSqm ? `${stats.averagePricePerSqm.toFixed(0)} €` : "-"}
          subtitle="Prix moyen des enchères"
          icon={<MapPin size={24} />}
        />
        <MetricCardWithTrend
          title="Ma watchlist"
          value={watchlist.size}
          icon={<Bell size={24} />}
          tooltip="Biens que vous surveillez"
        />
      </div>

      {/* Distribution chart */}
      {showDistribution && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 animate-scale-in">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Distribution des décotes</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Pie chart equivalent */}
            <div className="flex items-center justify-center gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-400 rounded"></div>
                  <span className="text-sm">Bonnes ({distributionStats.good})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span className="text-sm">Excellentes ({distributionStats.excellent})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-600 rounded"></div>
                  <span className="text-sm">Exceptionnelles ({distributionStats.exceptional})</span>
                </div>
              </div>
            </div>

            {/* Bar chart for ranges */}
            <div className="space-y-2">
              {distributionStats.ranges.map((range) => (
                <div key={range.label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12">{range.label}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary-500 transition-all duration-500"
                      style={{ width: `${Math.min((range.count / (data?.data.length || 1)) * 100 * 3, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-gray-600 w-6">{range.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs and controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex items-center gap-2">
          {/* Filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
              showFilters || activeFiltersCount > 0
                ? "bg-primary-100 text-primary-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Filter size={16} />
            Filtres
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.5 bg-primary-500 text-white text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              <ArrowUpDown size={16} />
              Trier
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 animate-scale-in">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSort(option.value)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                      currentSort === option.value ? "text-primary-600 bg-primary-50" : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap gap-4 items-end animate-slide-in-from-bottom-2">
          <SelectFilter
            label="Type de bien"
            options={propertyTypeOptions}
            value={selectedPropertyType}
            onChange={(value) => setSelectedPropertyType(value as PropertyType[])}
            multiple
            className="min-w-[150px]"
          />
          <RangeFilter
            label="Surface min"
            minValue={minSurface}
            maxValue={undefined}
            onMinChange={setMinSurface}
            onMaxChange={() => {}}
            step={10}
            unit="m²"
          />
          <RangeFilter
            label="Prix max"
            minValue={undefined}
            maxValue={maxPrice}
            onMinChange={() => {}}
            onMaxChange={setMaxPrice}
            step={10000}
            unit="€"
          />
          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setSelectedPropertyType([]);
                setMinSurface(undefined);
                setMaxPrice(undefined);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {/* Mini map of opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          {/* Results */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <PropertyCardSkeleton />
                </div>
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <EmptyState
              icon={<TrendingDown size={48} />}
              title="Aucune opportunité trouvée"
              description="Modifiez vos filtres ou explorez d'autres catégories."
              action={{ label: "Voir toutes", onClick: () => setActiveTab("all") }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredData.map((auction, index) => (
                <div
                  key={auction.id}
                  className="relative animate-fade-in"
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  onMouseEnter={() => setHoveredProperty(auction)}
                  onMouseLeave={() => setHoveredProperty(null)}
                >
                  {/* Watchlist button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWatchlist(auction.id);
                    }}
                    className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-colors ${
                      watchlist.has(auction.id)
                        ? "bg-yellow-100 text-yellow-600"
                        : "bg-white/80 text-gray-400 hover:text-yellow-500"
                    }`}
                    title={watchlist.has(auction.id) ? "Retirer de la watchlist" : "Ajouter à la watchlist"}
                  >
                    {watchlist.has(auction.id) ? <Bell size={16} /> : <BellOff size={16} />}
                  </button>

                  {/* Rank badge */}
                  <div className="absolute top-2 left-2 z-10 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>

                  <PropertyCard
                    auction={auction}
                    locale={APP_CONFIG.locale}
                    currency={APP_CONFIG.currency}
                    detailUrl={`/auctions/${auction.id}`}
                  />

                  {/* Hover tooltip with more details */}
                  {hoveredProperty?.id === auction.id && (
                    <div className="absolute left-full top-0 ml-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-20 animate-fade-in hidden xl:block">
                      <h4 className="font-medium text-gray-900 text-sm mb-2">Détails de l'opportunité</h4>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Prix enchère:</span>
                          <span className="font-medium">{formatCurrency(auction.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency)}</span>
                        </div>
                        {auction.marketPrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Estimation marché:</span>
                            <span className="font-medium">{formatCurrency(auction.marketPrice, APP_CONFIG.locale, APP_CONFIG.currency)}</span>
                          </div>
                        )}
                        {auction.discountPercent && (
                          <div className="flex justify-between text-green-600">
                            <span>Économie potentielle:</span>
                            <span className="font-bold">-{auction.discountPercent.toFixed(0)}%</span>
                          </div>
                        )}
                        {auction.pricePerSqm && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Prix/m²:</span>
                            <span>{formatCurrency(auction.pricePerSqm, APP_CONFIG.locale, APP_CONFIG.currency)}</span>
                          </div>
                        )}
                        {auction.auctionDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Date enchère:</span>
                            <span>{new Date(auction.auctionDate).toLocaleDateString(APP_CONFIG.locale)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side panel with map */}
        <div className="lg:col-span-1 space-y-4">
          <div className="sticky top-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Localisation</h3>
            <MiniMapPreview
              properties={filteredData}
              center={[APP_CONFIG.mapCenter.lat, APP_CONFIG.mapCenter.lng]}
              zoom={10}
              onViewFullMap={() => router.push("/map")}
              className="h-[300px]"
            />

            {/* Data freshness */}
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
              <Clock size={14} />
              <span>Données mises à jour il y a 2h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score explainer modal */}
      {showScoreExplainer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full animate-scale-in">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Comment fonctionne le score ?</h2>
              <button onClick={() => setShowScoreExplainer(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-gray-600">
                Le score d'opportunité est calculé en comparant le prix de mise aux enchères avec l'estimation du prix de marché.
              </p>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Formule de calcul</h3>
                <code className="text-sm bg-gray-200 px-2 py-1 rounded">
                  Décote = ((Prix marché - Prix enchère) / Prix marché) × 100
                </code>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Niveaux d'opportunité</h3>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-yellow-400 rounded-full"></span>
                  <div>
                    <span className="font-medium">Bonne affaire</span>
                    <span className="text-gray-500 text-sm ml-2">20-30% de décote</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  <div>
                    <span className="font-medium">Excellente</span>
                    <span className="text-gray-500 text-sm ml-2">30-40% de décote</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-emerald-600 rounded-full"></span>
                  <div>
                    <span className="font-medium">Exceptionnelle</span>
                    <span className="text-gray-500 text-sm ml-2">40%+ de décote</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-1">Sources de données</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• DVF (Demandes de Valeurs Foncières)</li>
                  <li>• Prix moyens au m² par quartier</li>
                  <li>• Historique des ventes similaires</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
