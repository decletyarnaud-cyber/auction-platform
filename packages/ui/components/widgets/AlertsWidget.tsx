"use client";

import { useState, useEffect } from "react";
import { Bell, Plus, X, Edit2, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";

export interface SavedAlert {
  id: string;
  name: string;
  criteria: {
    cities?: string[];
    minPrice?: number;
    maxPrice?: number;
    minDiscount?: number;
    propertyTypes?: string[];
  };
  matchCount?: number;
  createdAt: string;
  enabled: boolean;
}

const STORAGE_KEY = "saved_alerts";

interface AlertsWidgetProps {
  className?: string;
  onCreateAlert?: () => void;
  onEditAlert?: (alert: SavedAlert) => void;
}

export function AlertsWidget({
  className,
  onCreateAlert,
  onEditAlert,
}: AlertsWidgetProps) {
  const [alerts, setAlerts] = useState<SavedAlert[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setAlerts(JSON.parse(stored));
      } catch {
        setAlerts([]);
      }
    }
  }, []);

  const toggleAlert = (id: string) => {
    const newAlerts = alerts.map((a) =>
      a.id === id ? { ...a, enabled: !a.enabled } : a
    );
    setAlerts(newAlerts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAlerts));
  };

  const deleteAlert = (id: string) => {
    const newAlerts = alerts.filter((a) => a.id !== id);
    setAlerts(newAlerts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAlerts));
  };

  const formatCriteria = (alert: SavedAlert) => {
    const parts: string[] = [];
    if (alert.criteria.cities?.length) {
      parts.push(alert.criteria.cities.slice(0, 2).join(", "));
    }
    if (alert.criteria.minDiscount) {
      parts.push(`>${alert.criteria.minDiscount}% décote`);
    }
    if (alert.criteria.maxPrice) {
      parts.push(`<${(alert.criteria.maxPrice / 1000).toFixed(0)}k€`);
    }
    return parts.join(" • ") || "Tous les biens";
  };

  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Bell size={16} className="text-gray-400" />
            {alerts.filter((a) => a.enabled).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full" />
            )}
          </div>
          <h3 className="text-sm font-medium text-gray-700">Mes alertes</h3>
          <span className="text-xs text-gray-400">({alerts.length})</span>
        </button>
        <button
          onClick={onCreateAlert}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <Plus size={14} />
          Créer
        </button>
      </div>

      {isExpanded && (
        <div className="divide-y divide-gray-50">
          {alerts.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              <p>Aucune alerte configurée</p>
              <button
                onClick={onCreateAlert}
                className="mt-2 text-primary-600 hover:text-primary-700"
              >
                Créer ma première alerte
              </button>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-50"
              >
                {/* Toggle */}
                <button
                  onClick={() => toggleAlert(alert.id)}
                  className={cn(
                    "w-8 h-5 rounded-full transition-colors relative",
                    alert.enabled ? "bg-primary-500" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                      alert.enabled ? "left-3.5" : "left-0.5"
                    )}
                  />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {alert.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {formatCriteria(alert)}
                  </p>
                </div>

                {/* Match count */}
                {alert.matchCount !== undefined && alert.matchCount > 0 && (
                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
                    {alert.matchCount} new
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditAlert?.(alert)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Helper to save an alert
export function saveAlert(alert: Omit<SavedAlert, "id" | "createdAt">) {
  if (typeof window === "undefined") return;

  const stored = localStorage.getItem(STORAGE_KEY);
  let alerts: SavedAlert[] = [];

  try {
    alerts = stored ? JSON.parse(stored) : [];
  } catch {
    alerts = [];
  }

  const newAlert: SavedAlert = {
    ...alert,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  alerts.push(newAlert);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));

  return newAlert;
}
