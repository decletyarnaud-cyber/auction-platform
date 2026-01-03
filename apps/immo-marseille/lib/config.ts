import type { ImmoConfig } from "@repo/types";

export const APP_CONFIG: ImmoConfig = {
  name: "Immo-Agent Marseille",
  region: "Provence-Alpes-Côte d'Azur",
  locale: "fr-FR",
  currency: "EUR",
  mapCenter: { lat: 43.2965, lng: 5.3698 },
  mapZoom: 10,
  departments: ["13", "83"],
  courts: [
    "Tribunal Judiciaire de Marseille",
    "Tribunal Judiciaire d'Aix-en-Provence",
    "Tribunal Judiciaire de Toulon",
  ],
  cities: [
    "Marseille",
    "Aix-en-Provence",
    "Toulon",
  ],
  // For filtering - lowercase patterns to match courts
  allowedCourtPatterns: ["marseille", "toulon", "aix-en-provence"],
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Enchères", href: "/auctions", icon: "Gavel" },
  { label: "Carte", href: "/map", icon: "Map" },
  { label: "Opportunités", href: "/opportunities", icon: "TrendingDown" },
  { label: "Analyse", href: "/analysis", icon: "BarChart3" },
  { label: "Calendrier", href: "/calendar", icon: "Calendar" },
  { label: "À vérifier", href: "/data-quality", icon: "AlertTriangle" },
  { label: "Paramètres", href: "/settings", icon: "Settings" },
];
