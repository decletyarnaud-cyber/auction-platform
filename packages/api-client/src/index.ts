// Client
export { initApiClient, getApiClient, ApiError } from "./client";
export type { ApiClientConfig } from "./client";

// Static Data (for Vercel serverless deployment)
export { isStaticMode } from "./staticData";

// Provider
export { ApiProvider } from "./provider";

// Hooks - Generic
export {
  auctionKeys,
  useAuctionList,
  useAuctionDetail,
  useAuctionStats,
  useTriggerScrape,
} from "./hooks/useAuctions";

// Hooks - Properties
export {
  propertyKeys,
  useProperties,
  useProperty,
  usePropertyStats,
  useUpcomingProperties,
  usePropertyOpportunities,
  useMarketPrice,
  useIncompleteProperties,
  useDistantProperties,
} from "./hooks/useProperties";

// Hooks - Vehicles
export {
  vehicleKeys,
  useVehicles,
  useVehicle,
  useVehicleStats,
  useUpcomingVehicles,
  useVehicleBrands,
  useBestCTVehicles,
} from "./hooks/useVehicles";

// Hooks - Enrichment
export {
  enrichmentKeys,
  useDVFMarketPrice,
  useDVFTransactions,
  useINSEEIndicators,
  usePOIAccessibility,
  useCadastreParcel,
  useDocumentAnalysis,
  useFullEnrichment,
  usePropertyEnriched,
} from "./hooks/useEnrichment";

// Enrichment Types
export type {
  DVFMarketAnalysis,
  DVFDiscountAnalysis,
  DVFEnrichment,
  INSEEEnrichment,
  POIEnrichment,
  CadastreEnrichment,
  DocumentAnalysis,
  FullEnrichment,
  PropertyEnriched,
} from "./hooks/useEnrichment";
