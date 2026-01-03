"use client";

import { useEffect, useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";
import type { PropertyAuction } from "@repo/types";

interface MiniMapPreviewProps {
  properties: PropertyAuction[];
  center: [number, number];
  zoom?: number;
  className?: string;
  onViewFullMap?: () => void;
}

export function MiniMapPreview({
  properties,
  center,
  zoom = 10,
  className,
  onViewFullMap,
}: MiniMapPreviewProps) {
  const [MapComponents, setMapComponents] = useState<any>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")])
      .then(([reactLeaflet, L]) => {
        delete (L.default.Icon.Default.prototype as any)._getIconUrl;
        L.default.Icon.Default.mergeOptions({
          iconRetinaUrl:
            "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
          iconUrl:
            "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
          shadowUrl:
            "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        });
        setMapComponents({
          MapContainer: reactLeaflet.MapContainer,
          TileLayer: reactLeaflet.TileLayer,
          CircleMarker: reactLeaflet.CircleMarker,
        });
      })
      .catch(console.error);
  }, []);

  const propertiesWithCoords = properties.filter(
    (p) => p.latitude && p.longitude
  );

  if (!MapComponents) {
    return (
      <div
        className={cn(
          "bg-gray-100 rounded-xl flex items-center justify-center",
          className
        )}
      >
        <div className="text-gray-400 text-sm">Chargement carte...</div>
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker } = MapComponents;

  return (
    <div className={cn("relative rounded-xl overflow-hidden", className)}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        style={{ minHeight: "200px" }}
      >
        <TileLayer
          attribution=""
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {propertiesWithCoords.map((property) => (
          <CircleMarker
            key={property.id}
            center={[property.latitude!, property.longitude!]}
            radius={6}
            pathOptions={{
              color:
                property.opportunityLevel === "excellent" ||
                property.opportunityLevel === "exceptional"
                  ? "#22c55e"
                  : "#3b82f6",
              fillColor:
                property.opportunityLevel === "excellent" ||
                property.opportunityLevel === "exceptional"
                  ? "#22c55e"
                  : "#3b82f6",
              fillOpacity: 0.7,
            }}
          />
        ))}
      </MapContainer>

      {/* Overlay button */}
      <button
        onClick={onViewFullMap}
        className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center group"
      >
        <span className="bg-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
          <MapPin size={16} />
          Voir la carte complète
          <ExternalLink size={14} />
        </span>
      </button>

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs text-gray-600">
        {propertiesWithCoords.length} biens
      </div>
    </div>
  );
}
