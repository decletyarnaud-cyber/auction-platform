import { AuctionStatus, OpportunityLevel } from "./enums";

export interface BaseAuction {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  auctionDate: string | null;
  startingPrice: number | null;
  finalPrice: number | null;
  marketPrice: number | null;
  discountPercent: number | null;
  opportunityScore: number | null;
  opportunityLevel: OpportunityLevel;
  status: AuctionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuctionFilters {
  search?: string;
  status?: AuctionStatus[];
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  opportunityLevel?: OpportunityLevel[];
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuctionStats {
  total: number;
  upcoming: number;
  opportunities: number;
  averageDiscount: number;
}
