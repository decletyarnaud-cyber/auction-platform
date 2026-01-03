// Enums
export {
  AuctionStatus,
  PropertyType,
  FuelType,
  CTResult,
  OpportunityLevel,
} from "./enums";

// Base auction types
export type {
  BaseAuction,
  AuctionFilters,
  PaginationParams,
  PaginatedResponse,
  AuctionStats,
} from "./auction";

// Property types
export type {
  PropertyAuction,
  PropertyFilters,
  PropertyStats,
  MarketPrice,
  TensionLocative,
} from "./property";

// Vehicle types
export type {
  CTDefects,
  VehicleAuction,
  VehicleFilters,
  VehicleStats,
} from "./vehicle";

// Config types
export interface AppConfig {
  name: string;
  region: string;
  locale: string;
  currency: string;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
}

export interface ImmoConfig extends AppConfig {
  departments: string[];
  courts: string[];
  cities: string[];
  allowedCourtPatterns?: string[];  // Lowercase patterns for filtering courts (e.g., ["marseille", "toulon", "aix-en-provence"])
}

export interface VehicleConfig extends AppConfig {
  locations: string[];
  brands: string[];
}
