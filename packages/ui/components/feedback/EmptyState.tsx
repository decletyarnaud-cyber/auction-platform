"use client";

import { ReactNode } from "react";
import { Search, Filter, MapPin, Calendar, Home } from "lucide-react";
import { cn } from "../../lib/cn";

type EmptyStateType = "search" | "filter" | "map" | "calendar" | "default";

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  suggestions?: string[];
  className?: string;
  icon?: ReactNode;
}

const defaultConfig: Record<EmptyStateType, { icon: ReactNode; title: string; description: string }> = {
  search: {
    icon: <Search size={48} />,
    title: "Aucun résultat",
    description: "Essayez de modifier vos termes de recherche",
  },
  filter: {
    icon: <Filter size={48} />,
    title: "Aucun bien trouvé",
    description: "Aucun bien ne correspond à vos critères de filtrage",
  },
  map: {
    icon: <MapPin size={48} />,
    title: "Aucun bien géolocalisé",
    description: "Les biens de cette zone n'ont pas encore de coordonnées",
  },
  calendar: {
    icon: <Calendar size={48} />,
    title: "Aucune vente prévue",
    description: "Il n'y a pas de vente programmée à cette date",
  },
  default: {
    icon: <Home size={48} />,
    title: "Aucun bien disponible",
    description: "Revenez plus tard pour découvrir de nouvelles enchères",
  },
};

export function EmptyState({
  type = "default",
  title,
  description,
  action,
  suggestions,
  className,
  icon,
}: EmptyStateProps) {
  const config = defaultConfig[type];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      {/* Icon */}
      <div className="text-gray-300 mb-4">
        {icon || config.icon}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title || config.title}
      </h3>

      {/* Description */}
      <p className="text-gray-500 max-w-md mb-4">
        {description || config.description}
      </p>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">Suggestions :</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {suggestions.map((suggestion, i) => (
              <li key={i}>• {suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action button */}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
