import { BaseAuction, AuctionFilters } from "./auction";
import { FuelType, CTResult } from "./enums";

export interface CTDefects {
  critical: number;
  major: number;
  minor: number;
  total: number;
}

export interface VehicleAuction extends BaseAuction {
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
  mileage: number | null;
  fuel: FuelType | null;
  transmission: string | null;
  color: string | null;
  ctDefects: CTDefects | null;
  ctResult: CTResult | null;
  ctDate: string | null;
  ctUrl: string | null;
  isProfessionalOnly: boolean;
  photos: string[];
  location: string;
}

export interface VehicleFilters extends AuctionFilters {
  brand?: string[];
  model?: string[];
  minYear?: number;
  maxYear?: number;
  minMileage?: number;
  maxMileage?: number;
  fuel?: FuelType[];
  ctResult?: CTResult[];
  maxDefects?: number;
  professionalOnly?: boolean;
}

export interface VehicleStats {
  total: number;
  upcoming: number;
  withCT: number;
  averageDefects: number;
  byBrand: Record<string, number>;
  byFuel: Record<FuelType, number>;
}
