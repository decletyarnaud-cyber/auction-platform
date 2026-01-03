"use client";

import { useState, useEffect } from "react";
import { Clock, X, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import type { PropertyAuction } from "@repo/types";

const STORAGE_KEY = "recently_viewed_properties";
const MAX_ITEMS = 5;

interface RecentlyViewedProps {
  className?: string;
  onItemClick?: (property: PropertyAuction) => void;
  locale?: string;
}

export function RecentlyViewed({
  className,
  onItemClick,
  locale = "fr-FR",
}: RecentlyViewedProps) {
  const [items, setItems] = useState<PropertyAuction[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    }
  }, []);

  const removeItem = (id: string) => {
    const newItems = items.filter((item) => item.id !== id);
    setItems(newItems);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
  };

  const clearAll = () => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700">
            Consultés récemment
          </h3>
        </div>
        <button
          onClick={clearAll}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Effacer
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {items.slice(0, MAX_ITEMS).map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors group"
          >
            {/* Thumbnail */}
            <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              {item.photos?.[0] ? (
                <img
                  src={item.photos[0]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Clock size={20} />
                </div>
              )}
            </div>

            {/* Info */}
            <button
              onClick={() => onItemClick?.(item)}
              className="flex-1 text-left min-w-0"
            >
              <p className="text-sm font-medium text-gray-900 truncate">
                {item.address}
              </p>
              <p className="text-xs text-gray-500">
                {item.city} - {item.startingPrice?.toLocaleString(locale)} €
              </p>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => removeItem(item.id)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper function to add an item to recently viewed
export function addToRecentlyViewed(property: PropertyAuction) {
  if (typeof window === "undefined") return;

  const stored = localStorage.getItem(STORAGE_KEY);
  let items: PropertyAuction[] = [];

  try {
    items = stored ? JSON.parse(stored) : [];
  } catch {
    items = [];
  }

  // Remove if already exists
  items = items.filter((item) => item.id !== property.id);

  // Add to beginning
  items.unshift(property);

  // Keep only MAX_ITEMS
  items = items.slice(0, MAX_ITEMS);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
