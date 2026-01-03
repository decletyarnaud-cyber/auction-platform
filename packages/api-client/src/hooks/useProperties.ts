"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "../client";
import { useAuctionList, useAuctionDetail, useAuctionStats, auctionKeys } from "./useAuctions";
import {
  isStaticMode,
  getStaticAuctions,
  getStaticAuction,
  getStaticUpcoming,
  getStaticOpportunities,
  getStaticDistant,
  fetchStaticStats,
} from "../staticData";
import type {
  PropertyAuction,
  PropertyFilters,
  PropertyStats,
  PaginationParams,
  PaginatedResponse,
  MarketPrice,
} from "@repo/types";

const ENDPOINT = "/properties";

// Check static mode once at module level
const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC_MODE === "true";

// Keys specific to properties
export const propertyKeys = {
  ...auctionKeys,
  static: () => [...auctionKeys.all, "static"] as const,
  marketPrices: () => [...auctionKeys.all, "marketPrices"] as const,
  marketPrice: (postalCode: string) => [...propertyKeys.marketPrices(), postalCode] as const,
};

/**
 * Get list of properties with filters and pagination
 * Supports both API mode and static JSON mode
 */
export function useProperties(filters: PropertyFilters, pagination: PaginationParams) {
  if (STATIC_MODE) {
    return useQuery({
      queryKey: [...propertyKeys.static(), "list", filters, pagination],
      queryFn: () => getStaticAuctions(filters, pagination),
      staleTime: 60_000, // 1 minute (data is static anyway)
    });
  }

  return useAuctionList<PropertyAuction, PropertyFilters>(
    ENDPOINT,
    filters,
    pagination
  );
}

/**
 * Get a single property by ID
 * Supports both API mode and static JSON mode
 */
export function useProperty(id: string) {
  if (STATIC_MODE) {
    return useQuery({
      queryKey: [...propertyKeys.static(), "detail", id],
      queryFn: () => getStaticAuction(id),
      enabled: !!id,
      staleTime: 60_000,
    });
  }

  return useAuctionDetail<PropertyAuction>(ENDPOINT, id);
}

/**
 * Get property statistics
 * Supports both API mode and static JSON mode
 */
export function usePropertyStats(departments?: string[]) {
  if (STATIC_MODE) {
    return useQuery({
      queryKey: [...propertyKeys.static(), "stats", departments],
      queryFn: () => fetchStaticStats(),
      staleTime: 60_000,
    });
  }

  const params = departments?.length ? { department: departments } : {};
  return useQuery({
    queryKey: [...propertyKeys.stats(), departments],
    queryFn: () => getApiClient().get<PropertyStats>(`${ENDPOINT}/stats`, params),
    staleTime: 60_000,
  });
}

/**
 * Get upcoming auctions (sorted by date)
 * Supports both API mode and static JSON mode
 */
export function useUpcomingProperties(limit: number = 10, departments?: string[]) {
  if (STATIC_MODE) {
    return useQuery({
      queryKey: [...propertyKeys.static(), "upcoming", limit, departments],
      queryFn: () => getStaticUpcoming(limit, departments),
      staleTime: 30_000,
    });
  }

  const params: Record<string, any> = { limit };
  if (departments?.length) params.department = departments;
  return useQuery({
    queryKey: [...propertyKeys.upcoming(), departments],
    queryFn: () =>
      getApiClient().get<PaginatedResponse<PropertyAuction>>(`${ENDPOINT}/upcoming`, params),
    staleTime: 30_000,
  });
}

/**
 * Get best opportunity auctions (highest discounts)
 * Supports both API mode and static JSON mode
 */
export function usePropertyOpportunities(limit: number = 10, departments?: string[]) {
  if (STATIC_MODE) {
    return useQuery({
      queryKey: [...propertyKeys.static(), "opportunities", limit, departments],
      queryFn: () => getStaticOpportunities(limit, departments),
      staleTime: 30_000,
    });
  }

  const params: Record<string, any> = { limit };
  if (departments?.length) params.department = departments;
  return useQuery({
    queryKey: [...propertyKeys.opportunities(), departments],
    queryFn: () =>
      getApiClient().get<PaginatedResponse<PropertyAuction>>(`${ENDPOINT}/opportunities`, params),
    staleTime: 30_000,
  });
}

/**
 * Get market price for a postal code
 * Only available in API mode (static mode returns null)
 */
export function useMarketPrice(postalCode: string) {
  return useQuery({
    queryKey: propertyKeys.marketPrice(postalCode),
    queryFn: () => {
      if (STATIC_MODE) {
        // Market prices not available in static mode
        return Promise.resolve(null);
      }
      return getApiClient().get<MarketPrice>(`/market-prices/${postalCode}`);
    },
    enabled: !!postalCode && !STATIC_MODE,
    staleTime: 300_000, // 5 minutes
  });
}

/**
 * Get incomplete properties (for data quality dashboard)
 * Only available in API mode
 */
export function useIncompleteProperties(limit: number = 100) {
  return useQuery({
    queryKey: [...propertyKeys.all, "incomplete"] as const,
    queryFn: () => {
      if (STATIC_MODE) {
        return Promise.resolve({ data: [], total: 0, page: 1, limit, totalPages: 0 });
      }
      return getApiClient().get<PaginatedResponse<PropertyAuction>>(`${ENDPOINT}/incomplete`, {
        limit,
      });
    },
    staleTime: 60_000,
    enabled: !STATIC_MODE,
  });
}

/**
 * Get recently added properties (sorted by creation date)
 * Supports both API mode and static JSON mode
 */
export function useDistantProperties(limit: number = 10, departments?: string[]) {
  if (STATIC_MODE) {
    return useQuery({
      queryKey: [...propertyKeys.static(), "distant", limit, departments],
      queryFn: () => getStaticDistant(limit, departments),
      staleTime: 30_000,
    });
  }

  const params: Record<string, any> = { limit };
  if (departments?.length) params.department = departments;
  return useQuery({
    queryKey: [...propertyKeys.all, "distant", departments] as const,
    queryFn: () =>
      getApiClient().get<PaginatedResponse<PropertyAuction>>(`${ENDPOINT}/distant`, params),
    staleTime: 30_000,
  });
}
