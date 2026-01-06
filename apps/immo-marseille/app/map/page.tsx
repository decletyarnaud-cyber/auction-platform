"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProperties } from "@repo/api-client";
import { PropertyMap, formatCurrency } from "@repo/ui";
import { APP_CONFIG } from "@/lib/config";
import { type PropertyAuction, type PropertyFilters } from "@repo/types";
import { Maximize2, Minimize2, X, Navigation, ExternalLink, Euro, Home, Calendar, ArrowRight } from "lucide-react";

const DEFAULT_FILTERS: PropertyFilters = {};

export default function MapPage() {
  const router = useRouter();

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

  // State
  const [selectedProperty, setSelectedProperty] = useState<PropertyAuction | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedMarkers, setSelectedMarkers] = useState<Set<string>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [viewMode, setViewMode] = useState<"markers" | "heatmap">("markers");
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Fetch properties (no filters, show all)
  const { data, isLoading, error } = useProperties(DEFAULT_FILTERS, {
    page: 1,
    limit: 100,
    sortBy: "auctionDate",
    sortOrder: "asc",
  });

  const properties = data?.data || [];

  // Helper to check if court is allowed (empty patterns = allow all)
  const isCourtAllowed = useCallback((court: string | null | undefined): boolean => {
    const patterns = APP_CONFIG.allowedCourtPatterns || [];
    // If no patterns configured, allow all
    if (patterns.length === 0) return true;
    // If patterns configured but no court, reject
    if (!court) return false;
    const courtLower = court.toLowerCase();
    return patterns.some(p => courtLower.includes(p));
  }, []);

  const propertiesWithCoords = useMemo(() => {
    // Filter by department first (Marseille: 13, 83)
    const allowedDepts = APP_CONFIG.departments || [];
    let filtered = properties;

    if (allowedDepts.length > 0) {
      filtered = properties.filter((p) => allowedDepts.includes(p.department));
    }

    // Then filter by coords and court
    return filtered.filter((p) => p.latitude && p.longitude && isCourtAllowed(p.court));
  }, [properties, isCourtAllowed]);

  // Handlers
  const toggleFullscreen = () => {
    if (!document.fullscreenElement && mapContainerRef.current) {
      mapContainerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Impossible d'obtenir votre position");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const openStreetView = (lat: number, lng: number) => {
    window.open(
      `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`,
      "_blank"
    );
  };

  // Compare selected properties
  const selectedProperties = useMemo(
    () => propertiesWithCoords.filter((p) => selectedMarkers.has(p.id)),
    [propertiesWithCoords, selectedMarkers]
  );

  return (
    <div
      ref={mapContainerRef}
      className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-50" : "h-[500px]"} bg-gray-100`}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Carte des enchères</h1>
            <p className="text-sm text-gray-500">
              {propertiesWithCoords.length} biens géolocalisés
            </p>
          </div>
        </div>

        {/* Map controls */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg bg-white">
            <button
              onClick={() => setViewMode("markers")}
              className={`px-3 py-1.5 text-sm rounded-l-lg transition-colors ${
                viewMode === "markers" ? "bg-primary-100 text-primary-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Marqueurs
            </button>
            <button
              onClick={() => setViewMode("heatmap")}
              className={`px-3 py-1.5 text-sm rounded-r-lg transition-colors ${
                viewMode === "heatmap" ? "bg-primary-100 text-primary-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Densité
            </button>
          </div>

          {/* Geolocate */}
          <button
            onClick={handleGeolocate}
            disabled={isLocating}
            className={`p-2 rounded-lg border transition-colors ${
              userLocation ? "bg-blue-100 border-blue-300 text-blue-600" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title="Ma position"
          >
            <Navigation size={18} className={isLocating ? "animate-pulse" : ""} />
          </button>

          {/* Compare */}
          {selectedMarkers.size > 1 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
            >
              Comparer ({selectedMarkers.size})
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            title={isFullscreen ? "Quitter plein écran" : "Plein écran"}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex relative">
        {/* Map */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                <div className="text-gray-500">Chargement de la carte...</div>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <div className="text-red-500 mb-2">Erreur de chargement</div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : (
            <PropertyMap
              properties={propertiesWithCoords}
              center={userLocation || [APP_CONFIG.mapCenter.lat, APP_CONFIG.mapCenter.lng]}
              zoom={APP_CONFIG.mapZoom || 11}
              onMarkerClick={(property) => setSelectedProperty(property)}
              selectedId={selectedProperty?.id}
            />
          )}

          {/* User location indicator */}
          {userLocation && (
            <div className="absolute bottom-4 left-4 bg-white px-3 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 z-[1000]">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <span>Votre position</span>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-white p-3 rounded-lg shadow-lg z-[1000]">
            <div className="text-xs font-medium text-gray-700 mb-2">Légende</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                <span>Standard</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span>Opportunité</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span>Sélectionné</span>
              </div>
              {userLocation && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow"></span>
                  <span>Vous</span>
                </div>
              )}
            </div>
          </div>

          {/* Selected property panel */}
          {selectedProperty && (
            <div className="absolute top-4 left-4 bg-white rounded-xl shadow-xl border border-gray-200 w-80 z-[1000] animate-slide-in-from-left">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 line-clamp-2">{selectedProperty.address}</h3>
                    <p className="text-sm text-gray-500">{selectedProperty.city}</p>
                  </div>
                  <button
                    onClick={() => setSelectedProperty(null)}
                    className="p-1 hover:bg-gray-100 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Euro size={14} />
                      Prix
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(selectedProperty.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency)}
                    </span>
                  </div>
                  {selectedProperty.surface && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Home size={14} />
                        Surface
                      </span>
                      <span>{selectedProperty.surface} m²</span>
                    </div>
                  )}
                  {selectedProperty.discountPercent && selectedProperty.discountPercent > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Décote</span>
                      <span className="font-semibold text-green-600">
                        -{selectedProperty.discountPercent.toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {selectedProperty.auctionDate && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Calendar size={14} />
                        Enchère
                      </span>
                      <span>{new Date(selectedProperty.auctionDate).toLocaleDateString(APP_CONFIG.locale)}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => router.push(`/auctions/${selectedProperty.id}`)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  Voir l'analyse détaillée
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Modal */}
      {showCompareModal && selectedProperties.length > 1 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-auto animate-scale-in">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Comparer {selectedProperties.length} biens
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMarkers(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Tout désélectionner
                </button>
                <button
                  onClick={() => setShowCompareModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-gray-500">Critère</th>
                    {selectedProperties.map((item) => (
                      <th key={item.id} className="text-left p-3 font-medium min-w-[200px]">
                        <div className="line-clamp-2">{item.address}</div>
                        <div className="text-xs text-gray-400 font-normal">{item.city}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Prix</td>
                    {selectedProperties.map((item) => (
                      <td key={item.id} className="p-3 font-semibold">
                        {formatCurrency(item.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Surface</td>
                    {selectedProperties.map((item) => (
                      <td key={item.id} className="p-3">
                        {item.surface ? `${item.surface} m²` : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">€/m²</td>
                    {selectedProperties.map((item) => (
                      <td key={item.id} className="p-3">
                        {item.pricePerSqm
                          ? formatCurrency(item.pricePerSqm, APP_CONFIG.locale, APP_CONFIG.currency)
                          : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Décote</td>
                    {selectedProperties.map((item) => (
                      <td key={item.id} className="p-3">
                        {item.discountPercent ? (
                          <span
                            className={item.discountPercent >= 30 ? "text-green-600 font-semibold" : ""}
                          >
                            -{item.discountPercent.toFixed(0)}%
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Date enchère</td>
                    {selectedProperties.map((item) => (
                      <td key={item.id} className="p-3">
                        {item.auctionDate
                          ? new Date(item.auctionDate).toLocaleDateString(APP_CONFIG.locale)
                          : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="p-3 text-gray-500">Actions</td>
                    {selectedProperties.map((item) => (
                      <td key={item.id} className="p-3 space-x-2">
                        <a
                          href={`/auctions/${item.id}`}
                          className="text-primary-600 hover:underline font-medium"
                        >
                          Analyse
                        </a>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Source
                        </a>
                        {item.latitude && item.longitude && (
                          <button
                            onClick={() => openStreetView(item.latitude!, item.longitude!)}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            Street View
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
