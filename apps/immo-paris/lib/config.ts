import type { ImmoConfig } from "@repo/types";

export const APP_CONFIG: ImmoConfig = {
  name: "Immo-Agent Paris",
  region: "Paris & Île-de-France",
  locale: "fr-FR",
  currency: "EUR",
  mapCenter: { lat: 48.8566, lng: 2.3522 },
  mapZoom: 11,
  departments: ["75", "77", "78", "91", "92", "93", "94", "95"],
  courts: [
    "Tribunal Judiciaire de Paris",
    "Tribunal Judiciaire de Versailles",
    "Tribunal Judiciaire de Nanterre",
    "Tribunal Judiciaire de Bobigny",
    "Tribunal Judiciaire de Créteil",
    "Tribunal Judiciaire d'Évry",
    "Tribunal Judiciaire de Pontoise",
    "Tribunal Judiciaire de Meaux",
    "Tribunal Judiciaire de Melun",
  ],
  cities: [
    "Paris",
    "Versailles",
    "Nanterre",
    "Bobigny",
    "Créteil",
    "Évry",
    "Pontoise",
    "Meaux",
    "Melun",
    "Saint-Denis",
    "Montreuil",
    "Argenteuil",
    "Boulogne-Billancourt",
  ],
  // Filter courts - only show listings from these tribunals
  allowedCourtPatterns: ["paris", "versailles", "nanterre", "bobigny", "créteil", "évry", "pontoise", "meaux", "melun"],
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
