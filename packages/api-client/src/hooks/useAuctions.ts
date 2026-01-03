"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "../client";
import type {
  PaginatedResponse,
  PaginationParams,
  AuctionStats,
} from "@repo/types";

// Keys
export const auctionKeys = {
  all: ["auctions"] as const,
  lists: () => [...auctionKeys.all, "list"] as const,
  list: (filters: Record<string, any>) => [...auctionKeys.lists(), filters] as const,
  details: () => [...auctionKeys.all, "detail"] as const,
  detail: (id: string) => [...auctionKeys.details(), id] as const,
  stats: () => [...auctionKeys.all, "stats"] as const,
  upcoming: () => [...auctionKeys.all, "upcoming"] as const,
  opportunities: () => [...auctionKeys.all, "opportunities"] as const,
};

// Generic auction hooks (to be extended by specific types)
export function useAuctionList<T, F extends Record<string, any>>(
  endpoint: string,
  filters: F,
  pagination: PaginationParams
) {
  return useQuery({
    queryKey: auctionKeys.list({ endpoint, ...filters, ...pagination }),
    queryFn: () =>
      getApiClient().get<PaginatedResponse<T>>(endpoint, {
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
        sortBy: pagination.sortBy,
        sortOrder: pagination.sortOrder,
      }),
    staleTime: 30_000, // 30 seconds
  });
}

export function useAuctionDetail<T>(endpoint: string, id: string) {
  return useQuery({
    queryKey: auctionKeys.detail(id),
    queryFn: () => getApiClient().get<T>(`${endpoint}/${id}`),
    enabled: !!id,
  });
}

export function useAuctionStats(endpoint: string) {
  return useQuery({
    queryKey: auctionKeys.stats(),
    queryFn: () => getApiClient().get<AuctionStats>(`${endpoint}/stats`),
    staleTime: 60_000, // 1 minute
  });
}

export function useTriggerScrape(endpoint: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => getApiClient().post(`${endpoint}/scrape/trigger`),
    onSuccess: () => {
      // Invalidate all auction queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: auctionKeys.all });
    },
  });
}
