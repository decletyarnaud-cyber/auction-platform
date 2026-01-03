"use client";

import { PropertyAuction, AuctionStatus } from "@repo/types";
import { BaseCard } from "./BaseCard";
import { OpportunityBadge } from "../badges/OpportunityBadge";
import { formatCurrency, formatDate, formatSurface } from "../../lib/format";
import { cn } from "../../lib/cn";
import { MapPin, Calendar, Home, Ruler, Building2, Car, Store, Trees, Thermometer } from "lucide-react";

// Color mapping for property types - uses left border color
const PROPERTY_TYPE_COLORS: Record<string, { border: string; bg: string; icon: React.ReactNode }> = {
  appartement: { border: "border-l-blue-500", bg: "bg-blue-500", icon: <Building2 size={48} /> },
  apartment: { border: "border-l-blue-500", bg: "bg-blue-500", icon: <Building2 size={48} /> },
  maison: { border: "border-l-green-500", bg: "bg-green-500", icon: <Home size={48} /> },
  maisons: { border: "border-l-green-500", bg: "bg-green-500", icon: <Home size={48} /> },
  house: { border: "border-l-green-500", bg: "bg-green-500", icon: <Home size={48} /> },
  terrain: { border: "border-l-amber-500", bg: "bg-amber-500", icon: <Trees size={48} /> },
  terrains: { border: "border-l-amber-500", bg: "bg-amber-500", icon: <Trees size={48} /> },
  land: { border: "border-l-amber-500", bg: "bg-amber-500", icon: <Trees size={48} /> },
  parking: { border: "border-l-purple-500", bg: "bg-purple-500", icon: <Car size={48} /> },
  parkings: { border: "border-l-purple-500", bg: "bg-purple-500", icon: <Car size={48} /> },
  local_commercial: { border: "border-l-orange-500", bg: "bg-orange-500", icon: <Store size={48} /> },
  "locaux-commerciaux": { border: "border-l-orange-500", bg: "bg-orange-500", icon: <Store size={48} /> },
  commercial: { border: "border-l-orange-500", bg: "bg-orange-500", icon: <Store size={48} /> },
  immeuble: { border: "border-l-indigo-500", bg: "bg-indigo-500", icon: <Building2 size={48} /> },
  immeubles: { border: "border-l-indigo-500", bg: "bg-indigo-500", icon: <Building2 size={48} /> },
  autre: { border: "border-l-gray-400", bg: "bg-gray-400", icon: <Home size={48} /> },
  other: { border: "border-l-gray-400", bg: "bg-gray-400", icon: <Home size={48} /> },
};

const getPropertyTypeStyle = (type: string | undefined) => {
  if (!type) return PROPERTY_TYPE_COLORS.autre;
  const normalized = type.toLowerCase().trim();
  return PROPERTY_TYPE_COLORS[normalized] || PROPERTY_TYPE_COLORS.autre;
};

interface PropertyCardProps {
  auction: PropertyAuction;
  locale?: string;
  currency?: string;
  onClick?: () => void;
  /** If provided, clicking the card navigates here instead of auction.url */
  detailUrl?: string;
  /** If true, opens external URL in new tab. If false, navigates internally */
  openExternal?: boolean;
  /** Show mini map when no photo and coordinates available */
  showMiniMap?: boolean;
}

export function PropertyCard({
  auction,
  locale = "fr-FR",
  currency = "EUR",
  onClick,
  detailUrl,
  openExternal = false,
  showMiniMap = true,
}: PropertyCardProps) {
  const hasPhoto = auction.photos && auction.photos.length > 0;
  const hasCoordinates = auction.latitude && auction.longitude;
  const typeStyle = getPropertyTypeStyle(auction.propertyType);

  // Use detailUrl if provided, otherwise fall back to auction.url
  const targetUrl = detailUrl || (openExternal ? auction.url : undefined);

  // OpenStreetMap static image URL (no API key needed)
  const getMiniMapUrl = () => {
    if (!hasCoordinates) return null;
    // Use OpenStreetMap static map (free, no API key)
    return `https://www.openstreetmap.org/export/embed.html?bbox=${Number(auction.longitude) - 0.01},${Number(auction.latitude) - 0.01},${Number(auction.longitude) + 0.01},${Number(auction.latitude) + 0.01}&layer=mapnik&marker=${auction.latitude},${auction.longitude}`;
  };

  // Google Maps search URL for the link
  const getMapSearchUrl = () => {
    if (hasCoordinates) {
      return `https://www.google.com/maps/search/?api=1&query=${auction.latitude},${auction.longitude}`;
    }
    const query = encodeURIComponent(`${auction.address}, ${auction.postalCode} ${auction.city}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  };

  return (
    <BaseCard onClick={onClick} href={targetUrl} className={cn("flex flex-col border-l-4", typeStyle.border)}>
      {/* Image / Map / Placeholder */}
      <div className="relative h-48 bg-gray-100 overflow-hidden rounded-tr-lg">
        {hasPhoto ? (
          <img
            src={auction.photos[0]}
            alt={auction.address}
            className="w-full h-full object-cover"
          />
        ) : showMiniMap && hasCoordinates ? (
          <div className="relative w-full h-full bg-gray-200">
            <iframe
              src={getMiniMapUrl() || ""}
              className="w-full h-full border-0"
              loading="lazy"
              title={`Carte ${auction.address}`}
            />
            <a
              href={getMapSearchUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 bg-white/90 hover:bg-white px-2 py-1 rounded text-xs text-blue-600 font-medium shadow-sm transition-colors flex items-center gap-1 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin size={12} />
              Google Maps
            </a>
          </div>
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center text-white/80", typeStyle.bg)}>
            {typeStyle.icon}
          </div>
        )}
        {/* Only show badge for completed auctions - subtle style */}
        {auction.status === AuctionStatus.COMPLETED && (
          <div className="absolute top-2 left-2 z-10">
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/70 text-white font-medium">
              Passée
            </span>
          </div>
        )}
        {auction.opportunityLevel && (
          <div className="absolute top-2 right-2">
            <OpportunityBadge
              level={auction.opportunityLevel}
              discount={auction.discountPercent}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 line-clamp-2">
            {auction.address}
          </h3>
        </div>

        <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
          <MapPin size={14} />
          <span>
            {auction.postalCode} {auction.city}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
          {auction.surface && (
            <div className="flex items-center gap-1">
              <Ruler size={14} />
              <span>{formatSurface(auction.surface, locale)}</span>
            </div>
          )}
          {auction.rooms && (
            <div className="flex items-center gap-1">
              <Home size={14} />
              <span>{auction.rooms} pieces</span>
            </div>
          )}
        </div>

        {auction.auctionDate && (
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
            <Calendar size={14} />
            <span>{formatDate(auction.auctionDate, locale)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Mise a prix</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(auction.startingPrice, locale, currency)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Tension locative indicator */}
            {auction.tensionLocative && auction.tensionLocative.niveau > 0 && (
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                  auction.tensionLocative.niveau >= 3
                    ? "bg-red-100 text-red-700"
                    : auction.tensionLocative.niveau >= 2
                      ? "bg-orange-100 text-orange-700"
                      : "bg-yellow-100 text-yellow-700"
                )}
                title={auction.tensionLocative.label}
              >
                <Thermometer size={12} />
                <span>
                  {auction.tensionLocative.niveau >= 3
                    ? "Très tendue"
                    : auction.tensionLocative.niveau >= 2
                      ? "Tendue"
                      : "Zone"}
                </span>
              </div>
            )}
            {auction.pricePerSqm && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Prix/m2</p>
                <p className="text-sm font-medium text-gray-700">
                  {formatCurrency(auction.pricePerSqm, locale, currency)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseCard>
  );
}
