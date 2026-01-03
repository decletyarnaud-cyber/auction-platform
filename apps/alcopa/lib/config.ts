import type { VehicleConfig } from "@repo/types";

export const APP_CONFIG: VehicleConfig = {
  name: "Alcopa Tracker",
  region: "Vitrolles (Marseille)",
  locale: "fr-FR",
  currency: "EUR",
  mapCenter: { lat: 43.4167, lng: 5.2500 },
  mapZoom: 12,
  locations: ["marseille", "lyon", "paris", "bordeaux", "lille"],
  brands: [
    "Peugeot",
    "Renault",
    "Citroën",
    "Volkswagen",
    "BMW",
    "Mercedes",
    "Audi",
    "Ford",
    "Toyota",
    "Opel",
    "Fiat",
    "Nissan",
    "Hyundai",
    "Kia",
    "Dacia",
  ],
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Véhicules", href: "/vehicles", icon: "Car" },
  { label: "Paramètres", href: "/settings", icon: "Settings" },
];
