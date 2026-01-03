"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FilterPanel,
  SelectFilter,
  RangeFilter,
  SearchFilter,
  PropertyCard,
  PropertyCardSkeleton,
  PropertyListItem,
  Pagination,
  ActiveFilterTags,
  EmptyState,
  formatCurrency,
  type FilterTag,
} from "@repo/ui";
import { useProperties } from "@repo/api-client";
import { PropertyType, AuctionStatus, type PropertyFilters, type PaginationParams, type PropertyAuction } from "@repo/types";
import { APP_CONFIG } from "@/lib/config";
import {
  List,
  LayoutGrid,
  Download,
  GitCompare,
  Star,
  Eye,
  SlidersHorizontal,
  ArrowUpDown,
  X,
  ChevronUp,
  ChevronDown,
  Search,
} from "lucide-react";

const STORAGE_KEYS = {
  FILTERS: "auctions-filters",
  VIEW_MODE: "auctions-view-mode",
  SORT: "auctions-sort",
  FAVORITES: "auctions-favorites",
  VIEWED: "recently-viewed",
};

const DEFAULT_FILTERS: PropertyFilters = {};
const DEFAULT_PAGINATION: PaginationParams = {
  page: 1,
  limit: 500, // Show all auctions on one page
  sortBy: "auctionDate",
  sortOrder: "asc",
};

const statusOptions = [
  { value: AuctionStatus.UPCOMING, label: "À venir" },
  { value: AuctionStatus.ACTIVE, label: "En cours" },
  { value: AuctionStatus.COMPLETED, label: "Terminée" },
];

const propertyTypeOptions = [
  { value: PropertyType.APARTMENT, label: "Appartement" },
  { value: PropertyType.HOUSE, label: "Maison" },
  { value: PropertyType.COMMERCIAL, label: "Commercial" },
  { value: PropertyType.LAND, label: "Terrain" },
  { value: PropertyType.PARKING, label: "Parking" },
];

const sortOptions = [
  { value: "auctionDate:asc", label: "Date (proche → loin)" },
  { value: "auctionDate:desc", label: "Date (loin → proche)" },
  { value: "startingPrice:asc", label: "Prix (bas → haut)" },
  { value: "startingPrice:desc", label: "Prix (haut → bas)" },
  { value: "surface:desc", label: "Surface (grand → petit)" },
  { value: "pricePerSqm:asc", label: "€/m² (bas → haut)" },
  { value: "discountPercent:desc", label: "Décote (meilleure)" },
];

export default function AuctionsPage() {
  const router = useRouter();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // State
  const [filters, setFilters] = useState<PropertyFilters>(DEFAULT_FILTERS);
  const [pagination, setPagination] = useState<PaginationParams>(DEFAULT_PAGINATION);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showComparator, setShowComparator] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState<"all" | "favorites" | "viewed" | "not_viewed">("all");
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [liveResultCount, setLiveResultCount] = useState<number | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Load saved state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedFilters = localStorage.getItem(STORAGE_KEYS.FILTERS);
    const savedViewMode = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
    const savedSort = localStorage.getItem(STORAGE_KEYS.SORT);
    const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    const savedViewed = localStorage.getItem(STORAGE_KEYS.VIEWED);

    if (savedFilters) setFilters(JSON.parse(savedFilters));
    if (savedViewMode) setViewMode(savedViewMode as "grid" | "list");
    if (savedSort) {
      const [sortBy, sortOrder] = savedSort.split(":");
      setPagination(prev => ({ ...prev, sortBy, sortOrder: sortOrder as "asc" | "desc" }));
    }
    if (savedFavorites) setFavorites(new Set(JSON.parse(savedFavorites)));
    if (savedViewed) {
      const viewed = JSON.parse(savedViewed) as { id: string }[];
      setViewedIds(new Set(viewed.map(v => v.id)));
    }

    setIsInitialized(true);
  }, []);

  // Save state to localStorage
  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
  }, [filters, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
  }, [viewMode, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem(STORAGE_KEYS.SORT, `${pagination.sortBy}:${pagination.sortOrder}`);
  }, [pagination.sortBy, pagination.sortOrder, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...favorites]));
  }, [favorites, isInitialized]);

  const { data, isLoading, error } = useProperties(filters, pagination);

  // Live result count on search (debounced)
  useEffect(() => {
    if (filters.search && filters.search.length >= 2) {
      setLiveResultCount(data?.total ?? null);
    } else {
      setLiveResultCount(null);
    }
  }, [filters.search, data?.total]);

  // Helper to check if court is allowed (empty patterns = allow all)
  const isCourtAllowed = useCallback((court: string | null | undefined): boolean => {
    const patterns = APP_CONFIG.allowedCourtPatterns || [];
    // If no patterns configured, allow all
    if (patterns.length === 0) return true;
    // If patterns configured but no court, reject
    if (!court) return false;
    const courtLower = court.toLowerCase();
    return patterns.some(p => courtLower.includes(p));
  }, []);

  // Filter by quick filter AND allowed courts (TJ Marseille, TJ Toulon, TJ Aix)
  const filteredData = useMemo(() => {
    if (!data?.data) return [];

    // First, filter by allowed courts
    let result = data.data.filter(a => isCourtAllowed(a.court));

    // Then apply quick filter
    switch (quickFilter) {
      case "favorites":
        result = result.filter(a => favorites.has(a.id));
        break;
      case "viewed":
        result = result.filter(a => viewedIds.has(a.id));
        break;
      case "not_viewed":
        result = result.filter(a => !viewedIds.has(a.id));
        break;
    }

    return result;
  }, [data?.data, quickFilter, favorites, viewedIds, isCourtAllowed]);

  // Comparison items
  const comparisonItems = useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter(a => selectedIds.has(a.id));
  }, [data?.data, selectedIds]);

  // Active filter tags
  const activeFilterTags = useMemo((): FilterTag[] => {
    const tags: FilterTag[] = [];

    if (filters.search) tags.push({ key: "search", label: "Recherche", value: filters.search });
    if (filters.city?.length) tags.push({ key: "city", label: "Ville", value: filters.city });
    if (filters.court?.length) tags.push({ key: "court", label: "Tribunal", value: filters.court });
    if (filters.propertyType?.length) {
      const labels = filters.propertyType.map(t => propertyTypeOptions.find(o => o.value === t)?.label || t);
      tags.push({ key: "propertyType", label: "Type", value: labels });
    }
    if (filters.status?.length) {
      const labels = filters.status.map(s => statusOptions.find(o => o.value === s)?.label || s);
      tags.push({ key: "status", label: "Statut", value: labels });
    }
    if (filters.minPrice || filters.maxPrice) {
      const value = `${filters.minPrice ? formatCurrency(filters.minPrice, APP_CONFIG.locale, APP_CONFIG.currency) : "0"} - ${filters.maxPrice ? formatCurrency(filters.maxPrice, APP_CONFIG.locale, APP_CONFIG.currency) : "∞"}`;
      tags.push({ key: "price", label: "Prix", value });
    }
    if (filters.minSurface || filters.maxSurface) {
      const value = `${filters.minSurface || 0} - ${filters.maxSurface || "∞"} m²`;
      tags.push({ key: "surface", label: "Surface", value });
    }

    return tags;
  }, [filters]);

  // Handlers
  const updateFilter = <K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const removeFilter = (key: string) => {
    if (key === "price") {
      setFilters(prev => ({ ...prev, minPrice: undefined, maxPrice: undefined }));
    } else if (key === "surface") {
      setFilters(prev => ({ ...prev, minSurface: undefined, maxSurface: undefined }));
    } else {
      setFilters(prev => ({ ...prev, [key]: undefined }));
    }
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPagination(DEFAULT_PAGINATION);
    setQuickFilter("all");
    localStorage.removeItem(STORAGE_KEYS.FILTERS);
  };

  const toggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    setFocusedIndex(-1);
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const handleSort = (value: string) => {
    const [sortBy, sortOrder] = value.split(":");
    setPagination(prev => ({ ...prev, sortBy, sortOrder: sortOrder as "asc" | "desc" }));
    setShowSortDropdown(false);
  };

  const handleExport = (format: "csv" | "pdf") => {
    if (!data?.data) return;

    if (format === "csv") {
      const headers = ["Adresse", "Ville", "Prix", "Surface", "€/m²", "Date enchère", "Décote"];
      const rows = data.data.map(a => [
        a.address,
        a.city,
        a.startingPrice,
        a.surface,
        a.pricePerSqm,
        a.auctionDate,
        a.discountPercent ? `${a.discountPercent}%` : "",
      ]);

      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `encheres-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!filteredData.length) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredData.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        const auction = filteredData[focusedIndex];
        if (auction) router.push(`/auctions/${auction.id}`);
      } else if (e.key === "f" && focusedIndex >= 0) {
        const auction = filteredData[focusedIndex];
        if (auction) toggleFavorite(auction.id);
      } else if (e.key === "c" && focusedIndex >= 0) {
        const auction = filteredData[focusedIndex];
        if (auction) toggleSelection(auction.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredData, focusedIndex]);

  const activeFiltersCount = activeFilterTags.length;
  const cityOptions = APP_CONFIG.cities.map((city) => ({ value: city, label: city }));
  const courtOptions = APP_CONFIG.courts.map((court) => ({ value: court, label: court }));
  const currentSort = `${pagination.sortBy}:${pagination.sortOrder}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enchères</h1>
          <p className="text-gray-500">
            {data?.total ?? 0} bien{(data?.total ?? 0) > 1 ? "s" : ""} en vente
            {liveResultCount !== null && filters.search && (
              <span className="ml-2 text-primary-600 animate-pulse-subtle">
                ({liveResultCount} résultats)
              </span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Export */}
          <button
            onClick={() => handleExport("csv")}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Exporter CSV"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Comparator */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowComparator(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
            >
              <GitCompare size={18} />
              Comparer ({selectedIds.size})
            </button>
          )}

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowUpDown size={18} />
              <span className="hidden sm:inline">Trier</span>
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 animate-scale-in">
                {sortOptions.map(option => (
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

          {/* View mode */}
          <div className="flex items-center border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleViewMode("grid")}
              className={`p-2 rounded-l-lg transition-colors ${
                viewMode === "grid" ? "bg-primary-100 text-primary-600" : "text-gray-400 hover:text-gray-600"
              }`}
              title="Vue grille"
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => toggleViewMode("list")}
              className={`p-2 rounded-r-lg transition-colors ${
                viewMode === "list" ? "bg-primary-100 text-primary-600" : "text-gray-400 hover:text-gray-600"
              }`}
              title="Vue liste"
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Search with live count */}
      <div className="relative">
        <SearchFilter
          value={filters.search || ""}
          onChange={(value) => updateFilter("search", value || undefined)}
          placeholder="Rechercher une adresse, une ville..."
          className="max-w-md"
        />
      </div>

      {/* Quick filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">Filtres rapides:</span>
        <button
          onClick={() => setQuickFilter("all")}
          className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
            quickFilter === "all" ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Tous
        </button>
        <button
          onClick={() => setQuickFilter("favorites")}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-full transition-colors ${
            quickFilter === "favorites" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Star size={14} />
          Favoris ({favorites.size})
        </button>
        <button
          onClick={() => setQuickFilter("viewed")}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-full transition-colors ${
            quickFilter === "viewed" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Eye size={14} />
          Vus ({viewedIds.size})
        </button>
        <button
          onClick={() => setQuickFilter("not_viewed")}
          className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
            quickFilter === "not_viewed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Non vus
        </button>
      </div>

      {/* Filters */}
      <FilterPanel
        onReset={resetFilters}
        activeFiltersCount={activeFiltersCount}
        defaultCollapsed={activeFiltersCount === 0}
      >
        <SelectFilter
          label="Ville"
          options={cityOptions}
          value={(filters.city as string[]) || []}
          onChange={(value) => updateFilter("city", value as string[])}
          multiple
        />
        <SelectFilter
          label="Tribunal"
          options={courtOptions}
          value={(filters.court as string[]) || []}
          onChange={(value) => updateFilter("court", value as string[])}
          multiple
        />
        <SelectFilter
          label="Type de bien"
          options={propertyTypeOptions}
          value={(filters.propertyType as PropertyType[]) || []}
          onChange={(value) => updateFilter("propertyType", value as PropertyType[])}
          multiple
        />
        <SelectFilter
          label="Statut"
          options={statusOptions}
          value={(filters.status as AuctionStatus[]) || []}
          onChange={(value) => updateFilter("status", value as AuctionStatus[])}
          multiple
        />
        <RangeFilter
          label="Prix"
          minValue={filters.minPrice}
          maxValue={filters.maxPrice}
          onMinChange={(v) => updateFilter("minPrice", v)}
          onMaxChange={(v) => updateFilter("maxPrice", v)}
          step={10000}
          unit="€"
        />
        <RangeFilter
          label="Surface"
          minValue={filters.minSurface}
          maxValue={filters.maxSurface}
          onMinChange={(v) => updateFilter("minSurface", v)}
          onMaxChange={(v) => updateFilter("maxSurface", v)}
          step={5}
          unit="m²"
        />
      </FilterPanel>

      {/* Active filter tags */}
      <ActiveFilterTags
        filters={activeFilterTags}
        onRemove={removeFilter}
        onClearAll={resetFilters}
      />

      {/* Keyboard shortcuts hint */}
      <div className="hidden md:flex items-center gap-4 text-xs text-gray-400">
        <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">J</kbd>/<kbd className="px-1.5 py-0.5 bg-gray-100 rounded">K</kbd> Navigation</span>
        <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">Enter</kbd> Ouvrir</span>
        <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">F</kbd> Favori</span>
        <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">C</kbd> Comparer</span>
      </div>

      {/* Results */}
      <div ref={resultsRef}>
        {isLoading ? (
          <div className={`grid gap-4 ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"}`}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-in">
                <PropertyCardSkeleton />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<SlidersHorizontal size={48} />}
            title="Erreur de chargement"
            description="Impossible de charger les enchères. Réessayez plus tard."
            action={{ label: "Réessayer", onClick: () => window.location.reload() }}
          />
        ) : filteredData.length === 0 ? (
          <EmptyState
            icon={<Search size={48} />}
            title="Aucune enchère trouvée"
            description={quickFilter !== "all" ? "Aucun bien ne correspond à ce filtre rapide." : "Essayez de modifier vos critères de recherche."}
            action={activeFiltersCount > 0 ? { label: "Réinitialiser les filtres", onClick: resetFilters } : undefined}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredData.map((auction, index) => (
              <div
                key={auction.id}
                className={`relative animate-fade-in ${focusedIndex === index ? "ring-2 ring-primary-500 rounded-lg" : ""}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* Selection checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelection(auction.id); }}
                  className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    selectedIds.has(auction.id)
                      ? "bg-primary-500 border-primary-500 text-white"
                      : "bg-white/80 border-gray-300 hover:border-primary-500"
                  }`}
                >
                  {selectedIds.has(auction.id) && <span className="text-xs font-bold">{[...selectedIds].indexOf(auction.id) + 1}</span>}
                </button>

                {/* Favorite button */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(auction.id); }}
                  className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-colors ${
                    favorites.has(auction.id)
                      ? "bg-yellow-100 text-yellow-500"
                      : "bg-white/80 text-gray-400 hover:text-yellow-500"
                  }`}
                >
                  <Star size={16} fill={favorites.has(auction.id) ? "currentColor" : "none"} />
                </button>

                {/* Viewed indicator */}
                {viewedIds.has(auction.id) && (
                  <div className="absolute top-2 right-10 z-10 p-1 bg-blue-100 rounded-full">
                    <Eye size={14} className="text-blue-500" />
                  </div>
                )}

                <PropertyCard
                  auction={auction}
                  locale={APP_CONFIG.locale}
                  currency={APP_CONFIG.currency}
                  detailUrl={`/auctions/${auction.id}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredData.map((auction, index) => (
              <div
                key={auction.id}
                className={`animate-slide-in-from-bottom-2 ${focusedIndex === index ? "ring-2 ring-primary-500 rounded-lg" : ""}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <PropertyListItem
                  auction={auction}
                  locale={APP_CONFIG.locale}
                  currency={APP_CONFIG.currency}
                  isViewed={viewedIds.has(auction.id)}
                  isSelected={selectedIds.has(auction.id)}
                  showCheckbox
                  onSelect={(selected) => toggleSelection(auction.id)}
                  onClick={() => router.push(`/auctions/${auction.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination - hidden since we show all auctions on one page */}
      {/* Uncomment if pagination is needed again:
      {data && data.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={data.totalPages}
          totalItems={data.total}
          itemsPerPage={pagination.limit}
          onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
        />
      )}
      */}

      {/* Comparator Modal */}
      {showComparator && comparisonItems.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-auto animate-scale-in">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Comparer {comparisonItems.length} biens</h2>
              <button onClick={() => setShowComparator(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-gray-500">Critère</th>
                    {comparisonItems.map(item => (
                      <th key={item.id} className="text-left p-3 font-medium min-w-[200px]">
                        <div className="line-clamp-2">{item.address}</div>
                        <div className="text-xs text-gray-400 font-normal">{item.city}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Prix de départ</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3 font-semibold">
                        {formatCurrency(item.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Surface</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3">{item.surface ? `${item.surface} m²` : "-"}</td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">€/m²</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3">
                        {item.pricePerSqm ? formatCurrency(item.pricePerSqm, APP_CONFIG.locale, APP_CONFIG.currency) : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Pièces</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3">{item.rooms || "-"}</td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Décote</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3">
                        {item.discountPercent ? (
                          <span className={item.discountPercent >= 30 ? "text-green-600 font-semibold" : ""}>
                            -{item.discountPercent.toFixed(0)}%
                          </span>
                        ) : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Date enchère</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3">
                        {item.auctionDate ? new Date(item.auctionDate).toLocaleDateString(APP_CONFIG.locale) : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Lien</td>
                    {comparisonItems.map(item => (
                      <td key={item.id} className="p-3">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          Voir l'annonce →
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
