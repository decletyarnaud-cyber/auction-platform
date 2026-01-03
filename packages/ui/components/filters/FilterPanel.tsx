"use client";

import { ReactNode, useState } from "react";
import { cn } from "../../lib/cn";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";

interface FilterPanelProps {
  children: ReactNode;
  onReset?: () => void;
  activeFiltersCount?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

export function FilterPanel({
  children,
  onReset,
  activeFiltersCount = 0,
  collapsible = true,
  defaultCollapsed = false,
  className,
}: FilterPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-gray-200 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50",
          collapsible && "cursor-pointer"
        )}
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-gray-500" />
          <span className="font-medium text-gray-700">Filtres</span>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onReset && activeFiltersCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X size={14} />
              Effacer
            </button>
          )}
          {collapsible && (
            collapsed ? (
              <ChevronDown size={18} className="text-gray-400" />
            ) : (
              <ChevronUp size={18} className="text-gray-400" />
            )
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {children}
        </div>
      )}
    </div>
  );
}
