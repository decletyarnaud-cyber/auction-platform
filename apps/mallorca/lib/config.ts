import type { ImmoConfig } from "@repo/types";

export const APP_CONFIG: ImmoConfig = {
  name: "Mallorca Subastas",
  region: "Illes Balears",
  locale: "es-ES",
  currency: "EUR",
  mapCenter: { lat: 39.5696, lng: 2.6502 },
  mapZoom: 10,
  departments: ["07"], // Illes Balears province code
  courts: [
    "Juzgado Palma de Mallorca",
    "Juzgado Inca",
    "Juzgado Manacor",
    "Juzgado Ibiza",
    "Juzgado Mahón",
  ],
  cities: [
    "Palma de Mallorca",
    "Calvià",
    "Manacor",
    "Llucmajor",
    "Marratxí",
    "Inca",
    "Alcúdia",
    "Pollença",
    "Sóller",
    "Felanitx",
    "Santa Margalida",
    "Ibiza",
    "Mahón",
  ],
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Subastas", href: "/auctions", icon: "Gavel" },
  { label: "Mapa", href: "/map", icon: "Map" },
  { label: "Oportunidades", href: "/opportunities", icon: "TrendingDown" },
  { label: "Calendario", href: "/calendar", icon: "Calendar" },
  { label: "Ajustes", href: "/settings", icon: "Settings" },
];
