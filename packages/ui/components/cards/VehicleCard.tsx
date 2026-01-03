"use client";

import { VehicleAuction } from "@repo/types";
import { BaseCard } from "./BaseCard";
import { CTScoreBadge } from "../badges/CTScoreBadge";
import { StatusBadge } from "../badges/StatusBadge";
import { formatCurrency, formatDate, formatMileage } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Car, Calendar, Gauge, Fuel } from "lucide-react";

interface VehicleCardProps {
  auction: VehicleAuction;
  locale?: string;
  currency?: string;
  onClick?: () => void;
}

export function VehicleCard({
  auction,
  locale = "fr-FR",
  currency = "EUR",
  onClick,
}: VehicleCardProps) {
  const hasPhoto = auction.photos && auction.photos.length > 0;
  const title = `${auction.brand} ${auction.model}`;

  return (
    <BaseCard onClick={onClick} href={auction.url} className="flex flex-col">
      {/* Image */}
      <div className="relative h-48 bg-gray-100">
        {hasPhoto ? (
          <img
            src={auction.photos[0]}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Car size={48} />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <StatusBadge status={auction.status} size="sm" />
          {auction.isProfessionalOnly && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-800 text-white font-medium">
              Pro
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <CTScoreBadge
            result={auction.ctResult}
            defects={auction.ctDefects}
            size="sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <h3 className="font-semibold text-gray-900 line-clamp-1">{title}</h3>
        {auction.version && (
          <p className="text-sm text-gray-500 line-clamp-1">{auction.version}</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
          {auction.year && (
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              <span>{auction.year}</span>
            </div>
          )}
          {auction.mileage && (
            <div className="flex items-center gap-1">
              <Gauge size={14} />
              <span>{formatMileage(auction.mileage, locale)}</span>
            </div>
          )}
          {auction.fuel && (
            <div className="flex items-center gap-1">
              <Fuel size={14} />
              <span className="capitalize">{auction.fuel}</span>
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
          {auction.ctDefects && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Defauts CT</p>
              <p
                className={cn(
                  "text-sm font-medium",
                  auction.ctDefects.total === 0
                    ? "text-success-600"
                    : auction.ctDefects.critical > 0
                    ? "text-danger-600"
                    : "text-warning-600"
                )}
              >
                {auction.ctDefects.total}
              </p>
            </div>
          )}
        </div>
      </div>
    </BaseCard>
  );
}
