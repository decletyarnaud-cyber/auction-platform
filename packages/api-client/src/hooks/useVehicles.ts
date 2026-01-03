"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "../client";
import { useAuctionList, useAuctionDetail, auctionKeys } from "./useAuctions";
import type {
  VehicleAuction,
  VehicleFilters,
  VehicleStats,
  PaginationParams,
  PaginatedResponse,
} from "@repo/types";

const ENDPOINT = "/vehicles";

// Keys specific to vehicles
export const vehicleKeys = {
  ...auctionKeys,
  brands: () => [...auctionKeys.all, "brands"] as const,
};

export function useVehicles(filters: VehicleFilters, pagination: PaginationParams) {
  return useAuctionList<VehicleAuction, VehicleFilters>(
    ENDPOINT,
    filters,
    pagination
  );
}

export function useVehicle(id: string) {
  return useAuctionDetail<VehicleAuction>(ENDPOINT, id);
}

export function useVehicleStats() {
  return useQuery({
    queryKey: vehicleKeys.stats(),
    queryFn: () => getApiClient().get<VehicleStats>(`${ENDPOINT}/stats`),
    staleTime: 60_000,
  });
}

export function useUpcomingVehicles(limit: number = 10) {
  return useQuery({
    queryKey: vehicleKeys.upcoming(),
    queryFn: () =>
      getApiClient().get<PaginatedResponse<VehicleAuction>>(`${ENDPOINT}/upcoming`, {
        limit,
      }),
    staleTime: 30_000,
  });
}

export function useVehicleBrands() {
  return useQuery({
    queryKey: vehicleKeys.brands(),
    queryFn: () => getApiClient().get<string[]>(`${ENDPOINT}/brands`),
    staleTime: 300_000, // 5 minutes
  });
}

export function useBestCTVehicles(maxDefects: number = 3, limit: number = 10) {
  return useQuery({
    queryKey: [...vehicleKeys.all, "bestCT", maxDefects, limit],
    queryFn: () =>
      getApiClient().get<PaginatedResponse<VehicleAuction>>(`${ENDPOINT}`, {
        maxDefects,
        limit,
        sortBy: "ctDefects.total",
        sortOrder: "asc",
      }),
    staleTime: 30_000,
  });
}
