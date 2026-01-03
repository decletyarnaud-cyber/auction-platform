"use client";

import { useState } from "react";
import {
  FilterPanel,
  SelectFilter,
  RangeFilter,
  SearchFilter,
  VehicleCard,
  Pagination,
  TabNavigation,
} from "@repo/ui";
import { useVehicles, useVehicleBrands } from "@repo/api-client";
import { FuelType, CTResult, type VehicleFilters, type PaginationParams } from "@repo/types";
import { APP_CONFIG } from "@/lib/config";
import { List, LayoutGrid } from "lucide-react";

const DEFAULT_FILTERS: VehicleFilters = {};
const DEFAULT_PAGINATION: PaginationParams = {
  page: 1,
  limit: 12,
  sortBy: "auctionDate",
  sortOrder: "asc",
};

const fuelOptions = [
  { value: FuelType.DIESEL, label: "Diesel" },
  { value: FuelType.PETROL, label: "Essence" },
  { value: FuelType.ELECTRIC, label: "Électrique" },
  { value: FuelType.HYBRID, label: "Hybride" },
];

const ctResultOptions = [
  { value: CTResult.FAVORABLE, label: "Favorable" },
  { value: CTResult.MAJOR, label: "Défaut majeur" },
  { value: CTResult.CRITICAL, label: "Contre-visite" },
];

const tabs = [
  { id: "all", label: "Tous" },
  { id: "budget", label: "< 5000€" },
  { id: "best-ct", label: "Meilleurs CT" },
  { id: "diesel", label: "Diesel" },
  { id: "petrol", label: "Essence" },
];

export default function VehiclesPage() {
  const [filters, setFilters] = useState<VehicleFilters>(DEFAULT_FILTERS);
  const [pagination, setPagination] = useState<PaginationParams>(DEFAULT_PAGINATION);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState("all");

  const { data: brands } = useVehicleBrands();

  // Build filters based on active tab
  const tabFilters = {
    ...filters,
    ...(activeTab === "budget" && { maxPrice: 5000 }),
    ...(activeTab === "best-ct" && { maxDefects: 3 }),
    ...(activeTab === "diesel" && { fuel: [FuelType.DIESEL] }),
    ...(activeTab === "petrol" && { fuel: [FuelType.PETROL] }),
  };

  // Sort by defects for budget tab
  const tabPagination = activeTab === "budget"
    ? { ...pagination, sortBy: "ctDefects.total", sortOrder: "asc" as const }
    : pagination;

  const { data, isLoading, error } = useVehicles(tabFilters, tabPagination);

  const updateFilter = <K extends keyof VehicleFilters>(
    key: K,
    value: VehicleFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPagination(DEFAULT_PAGINATION);
    setActiveTab("all");
  };

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  const brandOptions = (brands || APP_CONFIG.brands).map((brand) => ({
    value: brand,
    label: brand,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Véhicules</h1>
          <p className="text-gray-500">
            {data?.total ?? 0} véhicule{(data?.total ?? 0) > 1 ? "s" : ""} en vente
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

      {/* Tabs */}
      <TabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setPagination((prev) => ({ ...prev, page: 1 }));
        }}
      />

      {/* Search */}
      <SearchFilter
        value={filters.search || ""}
        onChange={(value) => updateFilter("search", value || undefined)}
        placeholder="Rechercher une marque, un modèle..."
        className="max-w-md"
      />

      {/* Filters */}
      <FilterPanel
        onReset={resetFilters}
        activeFiltersCount={activeFiltersCount}
        defaultCollapsed={false}
      >
        <SelectFilter
          label="Marque"
          options={brandOptions}
          value={(filters.brand as string[]) || []}
          onChange={(value) => updateFilter("brand", value as string[])}
          multiple
        />
        <SelectFilter
          label="Carburant"
          options={fuelOptions}
          value={(filters.fuel as FuelType[]) || []}
          onChange={(value) => updateFilter("fuel", value as FuelType[])}
          multiple
        />
        <SelectFilter
          label="Résultat CT"
          options={ctResultOptions}
          value={(filters.ctResult as CTResult[]) || []}
          onChange={(value) => updateFilter("ctResult", value as CTResult[])}
          multiple
        />
        <RangeFilter
          label="Prix"
          minValue={filters.minPrice}
          maxValue={filters.maxPrice}
          onMinChange={(v) => updateFilter("minPrice", v)}
          onMaxChange={(v) => updateFilter("maxPrice", v)}
          step={500}
          unit="€"
        />
        <RangeFilter
          label="Année"
          minValue={filters.minYear}
          maxValue={filters.maxYear}
          onMinChange={(v) => updateFilter("minYear", v)}
          onMaxChange={(v) => updateFilter("maxYear", v)}
          step={1}
        />
        <RangeFilter
          label="Kilométrage"
          minValue={filters.minMileage}
          maxValue={filters.maxMileage}
          onMinChange={(v) => updateFilter("minMileage", v)}
          onMaxChange={(v) => updateFilter("maxMileage", v)}
          step={10000}
          unit="km"
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
          Aucun véhicule trouvé
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data?.data.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                auction={vehicle}
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
