"use client";

import { PropertyAuction } from "@repo/types";
import { OpportunityBadge } from "../badges/OpportunityBadge";
import { StatusBadge } from "../badges/StatusBadge";
import { formatCurrency, formatDate, formatSurface } from "../../lib/format";
import { cn } from "../../lib/cn";
import { MapPin, Calendar, Home, Ruler, ExternalLink, ChevronRight } from "lucide-react";

interface PropertyListItemProps {
  auction: PropertyAuction;
  locale?: string;
  currency?: string;
  onClick?: () => void;
  isViewed?: boolean;
  isSelected?: boolean;
  showCheckbox?: boolean;
  onSelect?: (selected: boolean) => void;
}

export function PropertyListItem({
  auction,
  locale = "fr-FR",
  currency = "EUR",
  onClick,
  isViewed = false,
  isSelected = false,
  showCheckbox = false,
  onSelect,
}: PropertyListItemProps) {
  const hasPhoto = auction.photos && auction.photos.length > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all group",
        isViewed && "opacity-75",
        isSelected && "ring-2 ring-primary-500"
      )}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect?.(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
      )}

      {/* Thumbnail */}
      <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
        {hasPhoto ? (
          <img
            src={auction.photos[0]}
            alt={auction.address}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Home size={32} />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-semibold text-gray-900 line-clamp-1">
              {auction.address}
            </h3>
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
              <MapPin size={14} />
              <span>
                {auction.postalCode} {auction.city}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={auction.status} size="sm" />
            {auction.opportunityLevel && auction.opportunityLevel !== "none" && (
              <OpportunityBadge
                level={auction.opportunityLevel}
                discount={auction.discountPercent}
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Details row */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {auction.surface && (
            <div className="flex items-center gap-1">
              <Ruler size={14} />
              <span>{formatSurface(auction.surface, locale)}</span>
            </div>
          )}
          {auction.rooms && (
            <div className="flex items-center gap-1">
              <Home size={14} />
              <span>{auction.rooms} pièces</span>
            </div>
          )}
          {auction.auctionDate && (
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              <span>{formatDate(auction.auctionDate, locale)}</span>
            </div>
          )}
          {auction.court && (
            <span className="text-gray-400">
              {auction.court}
            </span>
          )}
        </div>
      </div>

      {/* Price section */}
      <div className="text-right flex-shrink-0 w-32">
        <p className="text-xs text-gray-500">Mise à prix</p>
        <p className="text-lg font-bold text-gray-900">
          {formatCurrency(auction.startingPrice, locale, currency)}
        </p>
        {auction.pricePerSqm && (
          <p className="text-xs text-gray-500">
            {formatCurrency(auction.pricePerSqm, locale, currency)}/m²
          </p>
        )}
      </div>

      {/* Action button */}
      <button
        onClick={onClick}
        className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
