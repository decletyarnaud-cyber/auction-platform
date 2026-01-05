"use client";

import type {
  PropertyAuction,
  PropertyFilters,
  PropertyStats,
  PaginatedResponse,
  PaginationParams,
} from "@repo/types";

// Check if static mode is enabled
export const isStaticMode = (): boolean => {
  if (typeof window === "undefined") return false;
  return process.env.NEXT_PUBLIC_STATIC_MODE === "true";
};

// Cache for static data
let cachedAuctions: PropertyAuction[] = [];
let cachedStats: PropertyStats | null = null;
let cacheTimestamp: number = 0;
let cacheInitialized: boolean = false;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all auctions from static JSON
 */
export async function fetchStaticAuctions(): Promise<PropertyAuction[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (cacheInitialized && now - cacheTimestamp < CACHE_DURATION) {
    return cachedAuctions;
  }

  try {
    const response = await fetch("/data/auctions.json");
    if (!response.ok) {
      throw new Error(`Failed to fetch auctions: ${response.status}`);
    }
    const data = await response.json();
    cachedAuctions = data.auctions || [];
    cacheTimestamp = now;
    cacheInitialized = true;
    return cachedAuctions;
  } catch (error) {
    console.error("Error fetching static auctions:", error);
    return cachedAuctions;
  }
}

// Default empty stats
const EMPTY_STATS: PropertyStats = {
  total: 0,
  upcoming: 0,
  opportunities: 0,
  averageDiscount: 0,
  averagePricePerSqm: 0,
  byCity: {},
  byPropertyType: {} as Record<string, number>,
};

/**
 * Fetch stats from static JSON
 */
export async function fetchStaticStats(): Promise<PropertyStats> {
  try {
    const response = await fetch("/data/stats.json");
    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.status}`);
    }
    const data = await response.json();
    cachedStats = data as PropertyStats;
    return cachedStats;
  } catch (error) {
    console.error("Error fetching static stats:", error);
    return cachedStats || EMPTY_STATS;
  }
}

/**
 * Filter auctions based on PropertyFilters
 */
export function filterAuctions(
  auctions: PropertyAuction[],
  filters: PropertyFilters
): PropertyAuction[] {
  return auctions.filter((auction) => {
    // Search filter (searches in address, city, description)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchableText = [
        auction.address,
        auction.city,
        auction.description,
        auction.court,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchableText.includes(searchLower)) {
        return false;
      }
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(auction.status as any)) {
        return false;
      }
    }

    // Price filters
    if (filters.minPrice && (auction.startingPrice || 0) < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice && (auction.startingPrice || 0) > filters.maxPrice) {
      return false;
    }

    // Discount filter
    if (
      filters.minDiscount &&
      (auction.discountPercent || 0) < filters.minDiscount
    ) {
      return false;
    }

    // Opportunity level filter
    if (filters.opportunityLevel && filters.opportunityLevel.length > 0) {
      if (!filters.opportunityLevel.includes(auction.opportunityLevel as any)) {
        return false;
      }
    }

    // Date filters
    if (filters.dateFrom && auction.auctionDate) {
      if (new Date(auction.auctionDate) < new Date(filters.dateFrom)) {
        return false;
      }
    }
    if (filters.dateTo && auction.auctionDate) {
      if (new Date(auction.auctionDate) > new Date(filters.dateTo)) {
        return false;
      }
    }

    // City filter
    if (filters.city && filters.city.length > 0) {
      if (!filters.city.includes(auction.city)) {
        return false;
      }
    }

    // Department filter
    if (filters.department && filters.department.length > 0) {
      if (!filters.department.includes(auction.department)) {
        return false;
      }
    }

    // Court filter
    if (filters.court && filters.court.length > 0) {
      if (!filters.court.includes(auction.court)) {
        return false;
      }
    }

    // Property type filter
    if (filters.propertyType && filters.propertyType.length > 0) {
      if (!filters.propertyType.includes(auction.propertyType as any)) {
        return false;
      }
    }

    // Surface filters
    if (filters.minSurface && (auction.surface || 0) < filters.minSurface) {
      return false;
    }
    if (filters.maxSurface && (auction.surface || 0) > filters.maxSurface) {
      return false;
    }

    // Rooms filters
    if (filters.minRooms && (auction.rooms || 0) < filters.minRooms) {
      return false;
    }
    if (filters.maxRooms && (auction.rooms || 0) > filters.maxRooms) {
      return false;
    }

    // Has visit date filter
    if (filters.hasVisitDate) {
      if (!auction.visitDates || auction.visitDates.length === 0) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort auctions based on pagination params
 */
export function sortAuctions(
  auctions: PropertyAuction[],
  sortBy: string = "auctionDate",
  sortOrder: "asc" | "desc" = "asc"
): PropertyAuction[] {
  return [...auctions].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    switch (sortBy) {
      case "auctionDate":
        aVal = a.auctionDate ? new Date(a.auctionDate).getTime() : Infinity;
        bVal = b.auctionDate ? new Date(b.auctionDate).getTime() : Infinity;
        break;
      case "startingPrice":
        aVal = a.startingPrice || 0;
        bVal = b.startingPrice || 0;
        break;
      case "discountPercent":
        aVal = a.discountPercent || 0;
        bVal = b.discountPercent || 0;
        break;
      case "opportunityScore":
        aVal = a.opportunityScore || 0;
        bVal = b.opportunityScore || 0;
        break;
      case "surface":
        aVal = a.surface || 0;
        bVal = b.surface || 0;
        break;
      case "city":
        aVal = a.city || "";
        bVal = b.city || "";
        break;
      case "createdAt":
        aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        break;
      default:
        aVal = (a as any)[sortBy] || 0;
        bVal = (b as any)[sortBy] || 0;
    }

    if (sortOrder === "asc") {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });
}

/**
 * Paginate auctions
 */
export function paginateAuctions(
  auctions: PropertyAuction[],
  pagination: PaginationParams
): PaginatedResponse<PropertyAuction> {
  const total = auctions.length;
  const totalPages = Math.ceil(total / pagination.limit);
  const start = (pagination.page - 1) * pagination.limit;
  const end = start + pagination.limit;
  const data = auctions.slice(start, end);

  return {
    data,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages,
  };
}

/**
 * Get filtered, sorted, and paginated auctions
 */
export async function getStaticAuctions(
  filters: PropertyFilters,
  pagination: PaginationParams
): Promise<PaginatedResponse<PropertyAuction>> {
  const allAuctions = await fetchStaticAuctions();

  // Filter
  let result = filterAuctions(allAuctions, filters);

  // Sort
  result = sortAuctions(
    result,
    pagination.sortBy || "auctionDate",
    pagination.sortOrder || "asc"
  );

  // Paginate
  return paginateAuctions(result, pagination);
}

/**
 * Get a single auction by ID
 */
export async function getStaticAuction(
  id: string
): Promise<PropertyAuction | null> {
  const auctions = await fetchStaticAuctions();
  return auctions.find((a) => a.id === id) || null;
}

/**
 * Get upcoming auctions
 */
export async function getStaticUpcoming(
  limit: number = 10,
  departments?: string[]
): Promise<PaginatedResponse<PropertyAuction>> {
  const auctions = await fetchStaticAuctions();

  let filtered = auctions.filter((a) => a.status === "upcoming");

  if (departments && departments.length > 0) {
    filtered = filtered.filter((a) => departments.includes(a.department));
  }

  // Sort by auction date ascending
  filtered = sortAuctions(filtered, "auctionDate", "asc");

  // Take first N
  const data = filtered.slice(0, limit);

  return {
    data,
    total: filtered.length,
    page: 1,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
  };
}

/**
 * Get opportunity auctions (best discounts)
 */
export async function getStaticOpportunities(
  limit: number = 10,
  departments?: string[]
): Promise<PaginatedResponse<PropertyAuction>> {
  const auctions = await fetchStaticAuctions();

  let filtered = auctions.filter(
    (a) =>
      a.opportunityLevel &&
      ["good", "excellent", "exceptional"].includes(a.opportunityLevel)
  );

  if (departments && departments.length > 0) {
    filtered = filtered.filter((a) => departments.includes(a.department));
  }

  // Sort by discount descending
  filtered = sortAuctions(filtered, "discountPercent", "desc");

  // Take first N
  const data = filtered.slice(0, limit);

  return {
    data,
    total: filtered.length,
    page: 1,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
  };
}

/**
 * Get recently added auctions
 */
export async function getStaticDistant(
  limit: number = 10,
  departments?: string[]
): Promise<PaginatedResponse<PropertyAuction>> {
  const auctions = await fetchStaticAuctions();

  let filtered = [...auctions];

  if (departments && departments.length > 0) {
    filtered = filtered.filter((a) => departments.includes(a.department));
  }

  // Sort by createdAt descending (most recent first)
  filtered = sortAuctions(filtered, "createdAt", "desc");

  // Take first N
  const data = filtered.slice(0, limit);

  return {
    data,
    total: filtered.length,
    page: 1,
    limit,
    totalPages: Math.ceil(filtered.length / limit),
  };
}

/**
 * Visit data structure for calendar
 */
interface Visit {
  id: string;
  city: string;
  address: string;
  price: number;
  surface: number | null;
  propertyType: string;
  auctionDate: string;
  url?: string;
}

interface CalendarDay {
  date: string;
  count: number;
  visits: Visit[];
}

interface VisitsCalendarData {
  total: number;
  days: number;
  calendar: CalendarDay[];
}

/**
 * Get visits calendar data from static auctions
 * Filters by departments and builds calendar structure
 */
export async function getStaticVisitsCalendar(
  departments?: string[]
): Promise<VisitsCalendarData> {
  const auctions = await fetchStaticAuctions();

  // Filter by departments if provided
  let filtered = auctions;
  if (departments && departments.length > 0) {
    filtered = auctions.filter((a) => departments.includes(a.department));
  }

  // Filter only auctions with visit dates
  const auctionsWithVisits = filtered.filter(
    (a) => a.visitDates && a.visitDates.length > 0
  );

  // Build visits by date
  const visitsByDate: Record<string, Visit[]> = {};

  for (const auction of auctionsWithVisits) {
    for (const visitDate of auction.visitDates || []) {
      // Normalize date string to YYYY-MM-DD
      let dateStr = visitDate;
      if (visitDate.includes("T")) {
        dateStr = visitDate.split("T")[0];
      }

      if (!visitsByDate[dateStr]) {
        visitsByDate[dateStr] = [];
      }

      visitsByDate[dateStr].push({
        id: auction.id,
        city: auction.city,
        address: auction.address,
        price: auction.startingPrice || 0,
        surface: auction.surface || null,
        propertyType: auction.propertyType,
        auctionDate: auction.auctionDate || "",
        url: auction.url,
      });
    }
  }

  // Convert to calendar array sorted by date
  const calendar: CalendarDay[] = Object.entries(visitsByDate)
    .map(([date, visits]) => ({
      date,
      count: visits.length,
      visits,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate totals
  const total = calendar.reduce((sum, day) => sum + day.count, 0);

  return {
    total,
    days: calendar.length,
    calendar,
  };
}
