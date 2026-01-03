"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "../client";

// Types for enrichment data
export interface DVFMarketAnalysis {
  median_price_per_sqm: number;
  avg_price_per_sqm: number;
  transaction_count: number;
  confidence: "high" | "medium" | "low";
}

export interface DVFDiscountAnalysis {
  auction_price_per_sqm: number;
  market_price_per_sqm: number;
  discount_percent: number;
  estimated_market_value: number;
  potential_profit: number;
  confidence: string;
  based_on_transactions: number;
}

export interface DVFEnrichment {
  market_analysis: DVFMarketAnalysis | null;
  discount_analysis: DVFDiscountAnalysis | null;
}

export interface INSEEEnrichment {
  commune: {
    code: string;
    name: string;
    department: string;
    region: string;
  };
  population?: {
    total: number;
    density: number;
    median_age?: number;
  };
  income?: {
    median: number;
    unemployment_rate: number;
    poverty_rate: number;
  };
  housing?: {
    vacancy_rate: number;
    owner_occupied_rate: number;
  };
  quality_score: number | null;
  investment_attractiveness: "low" | "medium" | "high" | "very_high";
}

export interface POIEnrichment {
  scores: {
    transport: number;
    education: number;
    health: number;
    shopping: number;
    leisure: number;
    overall: number;
    walkability: "low" | "medium" | "high" | "very_high";
  };
  nearest_transport?: {
    name: string;
    type: string;
    distance: number;
  };
  poi_counts: {
    metro_stations: number;
    bus_stops: number;
    train_stations: number;
    schools: number;
    healthcare: number;
    shopping: number;
    leisure: number;
  };
  total_pois_500m: number;
  total_pois_1km: number;
}

export interface CadastreEnrichment {
  parcel: {
    id: string;
    section: string;
    numero: string;
    commune: string;
    surface: number;
  } | null;
  buildings_count: number;
  total_parcel_surface: number;
  total_built_surface: number;
  built_ratio: number | null;
  zone_type: "residential" | "commercial" | "agricultural" | "other" | null;
}

export interface DocumentAnalysis {
  document_type: "pv" | "cahier_charges" | "unknown";
  extraction_confidence: number;
  property: {
    type?: string;
    surface?: number;
    rooms?: number;
    floor?: number;
    dpe?: string;
    features?: string[];
    heating?: string;
  };
  legal: {
    court?: string;
    case_number?: string;
    lawyer?: string;
    lawyer_email?: string;
    lawyer_phone?: string;
  };
  financial: {
    starting_price?: number;
    charges?: number;
    property_tax?: number;
    occupation?: string;
  };
  visits: string[];
}

export interface FullEnrichment {
  dvf: DVFEnrichment | null;
  insee: INSEEEnrichment | null;
  poi: POIEnrichment | null;
  cadastre: CadastreEnrichment | null;
}

export interface PropertyEnriched {
  property: Record<string, any>;
  enrichment: {
    dvf: DVFEnrichment | null;
    insee: INSEEEnrichment | null;
    poi: POIEnrichment | null;
  };
}

// Query keys
export const enrichmentKeys = {
  all: ["enrichment"] as const,
  dvf: () => [...enrichmentKeys.all, "dvf"] as const,
  dvfMarketPrice: (postalCode: string, propertyType?: string) =>
    [...enrichmentKeys.dvf(), postalCode, propertyType] as const,
  dvfTransactions: (postalCode: string) =>
    [...enrichmentKeys.dvf(), "transactions", postalCode] as const,
  insee: () => [...enrichmentKeys.all, "insee"] as const,
  inseeByPostalCode: (postalCode: string) =>
    [...enrichmentKeys.insee(), postalCode] as const,
  poi: () => [...enrichmentKeys.all, "poi"] as const,
  poiByLocation: (lat: number, lng: number) =>
    [...enrichmentKeys.poi(), lat, lng] as const,
  cadastre: () => [...enrichmentKeys.all, "cadastre"] as const,
  cadastreByLocation: (lat: number, lng: number) =>
    [...enrichmentKeys.cadastre(), lat, lng] as const,
  document: () => [...enrichmentKeys.all, "document"] as const,
  documentByUrl: (url: string) => [...enrichmentKeys.document(), url] as const,
  full: () => [...enrichmentKeys.all, "full"] as const,
  fullByPostalCode: (postalCode: string) =>
    [...enrichmentKeys.full(), postalCode] as const,
  propertyEnriched: (id: string) =>
    [...enrichmentKeys.all, "property", id] as const,
};

const ENRICHMENT_ENDPOINT = "/enrichment";

// DVF Hooks
export function useDVFMarketPrice(
  postalCode: string,
  options?: {
    propertyType?: string;
    surface?: number;
    startingPrice?: number;
  }
) {
  return useQuery({
    queryKey: enrichmentKeys.dvfMarketPrice(postalCode, options?.propertyType),
    queryFn: () =>
      getApiClient().get<DVFEnrichment>(`${ENRICHMENT_ENDPOINT}/dvf/market-price`, {
        postal_code: postalCode,
        property_type: options?.propertyType,
        surface: options?.surface,
        starting_price: options?.startingPrice,
      }),
    enabled: !!postalCode,
    staleTime: 300_000, // 5 minutes
  });
}

export function useDVFTransactions(
  postalCode: string,
  options?: {
    propertyType?: string;
    monthsBack?: number;
    limit?: number;
  }
) {
  return useQuery({
    queryKey: enrichmentKeys.dvfTransactions(postalCode),
    queryFn: () =>
      getApiClient().get<{
        postal_code: string;
        transaction_count: number;
        transactions: Array<{
          date: string;
          price: number;
          surface: number;
          price_per_sqm: number;
          property_type: string;
          rooms: number;
          commune: string;
          address: string;
        }>;
      }>(`${ENRICHMENT_ENDPOINT}/dvf/transactions`, {
        postal_code: postalCode,
        property_type: options?.propertyType,
        months_back: options?.monthsBack,
        limit: options?.limit,
      }),
    enabled: !!postalCode,
    staleTime: 600_000, // 10 minutes
  });
}

// INSEE Hooks
export function useINSEEIndicators(postalCode: string, city?: string) {
  return useQuery({
    queryKey: enrichmentKeys.inseeByPostalCode(postalCode),
    queryFn: () =>
      getApiClient().get<INSEEEnrichment>(`${ENRICHMENT_ENDPOINT}/insee/socioeconomic`, {
        postal_code: postalCode,
        city,
      }),
    enabled: !!postalCode,
    staleTime: 3600_000, // 1 hour
  });
}

// POI Hooks
export function usePOIAccessibility(latitude?: number, longitude?: number) {
  return useQuery({
    queryKey: enrichmentKeys.poiByLocation(latitude || 0, longitude || 0),
    queryFn: () =>
      getApiClient().get<POIEnrichment>(`${ENRICHMENT_ENDPOINT}/poi/accessibility`, {
        latitude,
        longitude,
      }),
    enabled: !!latitude && !!longitude,
    staleTime: 3600_000, // 1 hour
  });
}

// Cadastre Hooks
export function useCadastreParcel(
  options: {
    latitude?: number;
    longitude?: number;
    address?: string;
    postalCode?: string;
    city?: string;
  }
) {
  const hasCoords = !!options.latitude && !!options.longitude;
  const hasAddress = !!options.address && !!options.postalCode && !!options.city;

  return useQuery({
    queryKey: enrichmentKeys.cadastreByLocation(
      options.latitude || 0,
      options.longitude || 0
    ),
    queryFn: () =>
      getApiClient().get<CadastreEnrichment>(`${ENRICHMENT_ENDPOINT}/cadastre/parcel`, {
        latitude: options.latitude,
        longitude: options.longitude,
        address: options.address,
        postal_code: options.postalCode,
        city: options.city,
      }),
    enabled: hasCoords || hasAddress,
    staleTime: 3600_000, // 1 hour
  });
}

// Document Analysis Hooks
export function useDocumentAnalysis(url: string) {
  return useQuery({
    queryKey: enrichmentKeys.documentByUrl(url),
    queryFn: () =>
      getApiClient().get<DocumentAnalysis>(`${ENRICHMENT_ENDPOINT}/document/analyze`, {
        url,
      }),
    enabled: !!url,
    staleTime: 86400_000, // 24 hours
  });
}

// Full Enrichment Hooks
export function useFullEnrichment(
  postalCode: string,
  options?: {
    latitude?: number;
    longitude?: number;
    address?: string;
    city?: string;
    surface?: number;
    startingPrice?: number;
    propertyType?: string;
  }
) {
  return useQuery({
    queryKey: enrichmentKeys.fullByPostalCode(postalCode),
    queryFn: () =>
      getApiClient().get<FullEnrichment>(`${ENRICHMENT_ENDPOINT}/full`, {
        postal_code: postalCode,
        latitude: options?.latitude,
        longitude: options?.longitude,
        address: options?.address,
        city: options?.city,
        surface: options?.surface,
        starting_price: options?.startingPrice,
        property_type: options?.propertyType,
      }),
    enabled: !!postalCode,
    staleTime: 300_000, // 5 minutes
  });
}

// Property Enriched Hook
export function usePropertyEnriched(propertyId: string) {
  return useQuery({
    queryKey: enrichmentKeys.propertyEnriched(propertyId),
    queryFn: () =>
      getApiClient().get<PropertyEnriched>(`/properties/${propertyId}/enriched`),
    enabled: !!propertyId,
    staleTime: 300_000, // 5 minutes
  });
}
