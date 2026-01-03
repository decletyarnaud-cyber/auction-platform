"use client";

import { useState, useEffect } from "react";
import { useProperties } from "@repo/api-client";
import { PropertyMap, PropertyCard } from "@repo/ui";
import { APP_CONFIG } from "@/lib/config";
import type { PropertyAuction } from "@repo/types";

export default function MapPage() {
  // Load Leaflet CSS dynamically
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);
  const [selectedProperty, setSelectedProperty] = useState<PropertyAuction | null>(null);

  // Fetch all properties (max limit for map view)
  const { data, isLoading, error } = useProperties(
    {}, // No filters
    {
      page: 1,
      limit: 100,
      sortBy: "auctionDate",
      sortOrder: "asc",
    }
  );

  const properties = data?.data || [];
  const propertiesWithCoords = properties.filter(p => p.latitude && p.longitude);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Carte des enchères</h1>
        <p className="text-gray-500">
          {propertiesWithCoords.length} biens géolocalisés sur {properties.length} total
        </p>
      </div>

      {/* Map and sidebar */}
      <div className="flex-1 flex">
        {/* Map */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-gray-500">Chargement de la carte...</div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-red-500">Erreur de chargement</div>
            </div>
          ) : (
            <PropertyMap
              properties={properties}
              center={[APP_CONFIG.mapCenter.lat, APP_CONFIG.mapCenter.lng]}
              zoom={APP_CONFIG.mapZoom || 11}
              onMarkerClick={(property) => setSelectedProperty(property)}
              selectedId={selectedProperty?.id}
            />
          )}
        </div>

        {/* Sidebar with selected property */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
          {selectedProperty ? (
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-4">Bien sélectionné</h2>
              <PropertyCard
                auction={selectedProperty}
                locale={APP_CONFIG.locale}
                currency={APP_CONFIG.currency}
                onClick={() => window.open(`/auctions/${selectedProperty.id}`, "_blank")}
              />
              <div className="mt-4">
                <a
                  href={`/auctions/${selectedProperty.id}`}
                  className="block w-full text-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Voir les détails
                </a>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <p className="mb-4">Cliquez sur un marqueur pour voir les détails</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  <span>Enchère standard</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  <span>Bonne opportunité</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                  <span>Sélectionné</span>
                </div>
              </div>
            </div>
          )}

          {/* List of properties with coordinates */}
          <div className="border-t border-gray-200 mt-4">
            <h3 className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50">
              Tous les biens ({propertiesWithCoords.length})
            </h3>
            <div className="divide-y divide-gray-100">
              {propertiesWithCoords.slice(0, 20).map((property) => (
                <button
                  key={property.id}
                  onClick={() => setSelectedProperty(property)}
                  className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                    selectedProperty?.id === property.id ? "bg-primary-50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">
                    {property.address}
                  </p>
                  <p className="text-xs text-gray-500">
                    {property.city} - {property.startingPrice?.toLocaleString("fr-FR")} €
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
