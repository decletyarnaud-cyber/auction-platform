import { BaseAuction, AuctionFilters } from "./auction";
import { PropertyType } from "./enums";

export interface TensionLocative {
  tension: string;
  niveau: number;
  label: string;
  nom?: string;
  communes_tendues?: number;
}

export interface PropertyAuction extends BaseAuction {
  address: string;
  postalCode: string;
  city: string;
  department: string;
  latitude: number | null;
  longitude: number | null;
  propertyType: PropertyType;
  surface: number | null;
  rooms: number | null;
  description: string;
  court: string;
  lawyerName: string | null;
  lawyerEmail: string | null;
  lawyerPhone: string | null;
  visitDates: string[];
  photos: string[];
  pvUrl: string | null;
  pricePerSqm: number | null;
  marketPricePerSqm: number | null;
  tensionLocative?: TensionLocative | null;
}

export interface PropertyFilters extends AuctionFilters {
  city?: string[];
  department?: string[];
  court?: string[];
  propertyType?: PropertyType[];
  minSurface?: number;
  maxSurface?: number;
  minRooms?: number;
  maxRooms?: number;
  hasVisitDate?: boolean;
}

export interface PropertyStats {
  total: number;
  upcoming: number;
  opportunities: number;
  averageDiscount: number;
  averagePricePerSqm: number;
  byCity: Record<string, number>;
  byPropertyType: Record<PropertyType, number>;
}

export interface MarketPrice {
  postalCode: string;
  city: string;
  neighborhood?: string;
  pricePerSqm: number;
  lastUpdated: string;
}
