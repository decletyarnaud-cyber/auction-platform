"use client";

import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface FilterTag {
  key: string;
  label: string;
  value: string | string[];
}

interface ActiveFilterTagsProps {
  filters: FilterTag[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function ActiveFilterTags({
  filters,
  onRemove,
  onClearAll,
  className,
}: ActiveFilterTagsProps) {
  if (filters.length === 0) return null;

  const formatValue = (value: string | string[]) => {
    if (Array.isArray(value)) {
      if (value.length === 1) return value[0];
      return `${value.length} sélectionnés`;
    }
    return value;
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm rounded-full"
        >
          <span className="text-primary-500 text-xs">{filter.label}:</span>
          <span className="font-medium">{formatValue(filter.value)}</span>
          <button
            onClick={() => onRemove(filter.key)}
            className="p-0.5 hover:bg-primary-100 rounded-full transition-colors"
          >
            <X size={14} />
          </button>
        </span>
      ))}

      {filters.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Tout effacer
        </button>
      )}
    </div>
  );
}
