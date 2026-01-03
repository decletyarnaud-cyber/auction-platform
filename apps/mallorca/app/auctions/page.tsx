"use client";

import { useState } from "react";
import {
  FilterPanel,
  SelectFilter,
  RangeFilter,
  SearchFilter,
  PropertyCard,
  Pagination,
  TabNavigation,
} from "@repo/ui";
import { useProperties } from "@repo/api-client";
import { PropertyType, AuctionStatus, type PropertyFilters, type PaginationParams } from "@repo/types";
import { APP_CONFIG } from "@/lib/config";
import { List, LayoutGrid } from "lucide-react";

const DEFAULT_FILTERS: PropertyFilters = {};
const DEFAULT_PAGINATION: PaginationParams = {
  page: 1,
  limit: 12,
  sortBy: "auctionDate",
  sortOrder: "asc",
};

const statusOptions = [
  { value: AuctionStatus.UPCOMING, label: "A venir" },
  { value: AuctionStatus.ACTIVE, label: "En cours" },
  { value: AuctionStatus.COMPLETED, label: "Terminee" },
];

const propertyTypeOptions = [
  { value: PropertyType.APARTMENT, label: "Appartement" },
  { value: PropertyType.HOUSE, label: "Maison" },
  { value: PropertyType.COMMERCIAL, label: "Commercial" },
  { value: PropertyType.LAND, label: "Terrain" },
  { value: PropertyType.PARKING, label: "Parking" },
];

export default function AuctionsPage() {
  const [filters, setFilters] = useState<PropertyFilters>(DEFAULT_FILTERS);
  const [pagination, setPagination] = useState<PaginationParams>(DEFAULT_PAGINATION);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data, isLoading, error } = useProperties(filters, pagination);

  const updateFilter = <K extends keyof PropertyFilters>(
    key: K,
    value: PropertyFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPagination(DEFAULT_PAGINATION);
  };

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  const cityOptions = APP_CONFIG.cities.map((city) => ({
    value: city,
    label: city,
  }));

  const courtOptions = APP_CONFIG.courts.map((court) => ({
    value: court,
    label: court,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enchères</h1>
          <p className="text-gray-500">
            {data?.total ?? 0} bien{(data?.total ?? 0) > 1 ? "s" : ""} en vente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded ${viewMode === "grid" ? "bg-primary-100 text-primary-600" : "text-gray-400 hover:text-gray-600"}`}
          >
            <LayoutGrid size={20} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded ${viewMode === "list" ? "bg-primary-100 text-primary-600" : "text-gray-400 hover:text-gray-600"}`}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      <SearchFilter
        value={filters.search || ""}
        onChange={(value) => updateFilter("search", value || undefined)}
        placeholder="Rechercher une adresse, une ville..."
        className="max-w-md"
      />

      {/* Filters */}
      <FilterPanel
        onReset={resetFilters}
        activeFiltersCount={activeFiltersCount}
        defaultCollapsed={false}
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

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-80 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-gray-500">
          Erreur lors du chargement des données
        </div>
      ) : data?.data.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Aucune enchère trouvée
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data?.data.map((auction) => (
              <PropertyCard
                key={auction.id}
                auction={auction}
                locale={APP_CONFIG.locale}
                currency={APP_CONFIG.currency}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={data.totalPages}
              totalItems={data.total}
              itemsPerPage={pagination.limit}
              onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
            />
          )}
        </>
      )}
    </div>
  );
}
