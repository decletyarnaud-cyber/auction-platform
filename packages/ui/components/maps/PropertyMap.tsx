"use client";

import { useEffect, useState } from "react";
import type { PropertyAuction } from "@repo/types";

interface PropertyMapProps {
  properties: PropertyAuction[];
  center?: [number, number];
  zoom?: number;
  onMarkerClick?: (property: PropertyAuction) => void;
  selectedId?: string;
}

export function PropertyMap({
  properties,
  center = [48.8566, 2.3522], // Paris default
  zoom = 11,
  onMarkerClick,
  selectedId,
}: PropertyMapProps) {
  const [MapComponents, setMapComponents] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    Promise.all([
      import("react-leaflet"),
      import("leaflet"),
    ])
      .then(([reactLeaflet, L]) => {
        // Fix default marker icons
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
          Marker: reactLeaflet.Marker,
          Popup: reactLeaflet.Popup,
          L: L.default,
        });
      })
      .catch((err) => {
        console.error("Error loading map:", err);
        setError(err.message);
      });
  }, []);

  if (error) {
    return (
      <div className="w-full h-full bg-red-50 flex items-center justify-center">
        <div className="text-red-500">Erreur: {error}</div>
      </div>
    );
  }

  if (!MapComponents) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Chargement de la carte...</div>
      </div>
    );
  }

  const { MapContainer: LeafletMap, TileLayer, Marker, Popup, L } = MapComponents;

  // Filter properties with coordinates
  const mappableProperties = properties.filter(
    (p) => p.latitude && p.longitude
  );

  // Create custom icons
  const defaultIcon = new L.Icon({
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const selectedIcon = new L.Icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const opportunityIcon = new L.Icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const getIcon = (property: PropertyAuction) => {
    if (selectedId === property.id) return selectedIcon;
    if (property.opportunityLevel === "excellent" || property.opportunityLevel === "exceptional") {
      return opportunityIcon;
    }
    return defaultIcon;
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return "N/A";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <LeafletMap
      center={center}
      zoom={zoom}
      className="w-full h-full"
      style={{ minHeight: "400px", height: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {mappableProperties.map((property) => (
        <Marker
          key={property.id}
          position={[property.latitude!, property.longitude!]}
          icon={getIcon(property)}
          eventHandlers={{
            click: () => onMarkerClick?.(property),
          }}
        >
          <Popup>
            <div className="min-w-[200px]">
              <h3 className="font-semibold text-sm mb-1 line-clamp-2">
                {property.address}
              </h3>
              <p className="text-xs text-gray-600 mb-2">
                {property.city} {property.postalCode}
              </p>
              <div className="flex justify-between text-xs">
                <span>Mise à prix:</span>
                <span className="font-medium">
                  {formatPrice(property.startingPrice)}
                </span>
              </div>
              {property.surface && (
                <div className="flex justify-between text-xs">
                  <span>Surface:</span>
                  <span>{property.surface} m²</span>
                </div>
              )}
              {property.discountPercent && property.discountPercent > 0 && (
                <div className="flex justify-between text-xs mt-1">
                  <span>Décote:</span>
                  <span className="text-green-600 font-medium">
                    -{property.discountPercent.toFixed(0)}%
                  </span>
                </div>
              )}
              {property.auctionDate && (
                <div className="text-xs text-gray-500 mt-2 pt-2 border-t">
                  Vente: {new Date(property.auctionDate).toLocaleDateString("fr-FR")}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </LeafletMap>
  );
}
