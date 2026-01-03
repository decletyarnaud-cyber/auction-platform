"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MetricCardWithTrend,
  EmptyState,
  formatCurrency,
} from "@repo/ui";
import { useProperties } from "@repo/api-client";
import { APP_CONFIG } from "@/lib/config";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Filter,
  ArrowUpDown,
  MapPin,
  Euro,
  Maximize2,
  ChevronRight,
  Calculator,
  AlertCircle,
  Clock,
  Home,
  Building2,
  Car,
  Store,
  Trees,
  Search,
  Calendar,
  Gem,
  Eye,
  ExternalLink,
  Mail,
} from "lucide-react";

// Property type colors for left border
const TYPE_COLORS: Record<string, string> = {
  apartment: "border-l-blue-500",
  house: "border-l-green-500",
  land: "border-l-amber-500",
  parking: "border-l-purple-500",
  commercial: "border-l-orange-500",
  other: "border-l-gray-400",
};

const TYPE_BG: Record<string, string> = {
  apartment: "bg-blue-500",
  house: "bg-green-500",
  land: "bg-amber-500",
  parking: "bg-purple-500",
  commercial: "bg-orange-500",
  other: "bg-gray-400",
};

const TYPE_LABELS: Record<string, string> = {
  apartment: "Appartement",
  house: "Maison",
  land: "Terrain",
  parking: "Parking",
  commercial: "Local commercial",
  other: "Autre",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  apartment: <Building2 size={16} />,
  house: <Home size={16} />,
  land: <Trees size={16} />,
  parking: <Car size={16} />,
  commercial: <Store size={16} />,
  other: <Home size={16} />,
};

const sortOptions = [
  { value: "potentialGain:desc", label: "Gain potentiel (haut → bas)" },
  { value: "discountPercent:desc", label: "Décote (haute → basse)" },
  { value: "nextVisit:asc", label: "Prochaine visite (proche)" },
  { value: "pricePerSqm:asc", label: "Prix/m² (bas → haut)" },
  { value: "startingPrice:asc", label: "Prix total (bas → haut)" },
  { value: "auctionDate:asc", label: "Date vente (proche)" },
];

const typeFilterOptions = [
  { value: "all", label: "Tous les types" },
  { value: "apartment", label: "Appartements" },
  { value: "house", label: "Maisons" },
  { value: "commercial", label: "Locaux commerciaux" },
  { value: "land", label: "Terrains" },
  { value: "parking", label: "Parkings" },
];

function getNextVisitDate(visitDates: string[]): Date | null {
  if (!visitDates || visitDates.length === 0) return null;

  const now = new Date();
  const futureVisits = visitDates
    .map(d => new Date(d))
    .filter(d => d >= now)
    .sort((a, b) => a.getTime() - b.getTime());

  return futureVisits.length > 0 ? futureVisits[0] : null;
}

function getDaysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getVisitBadge(visitDates: string[]): { text: string; color: string; urgent: boolean } | null {
  const nextVisit = getNextVisitDate(visitDates);
  if (!nextVisit) return null;

  const days = getDaysUntil(nextVisit);

  if (days <= 3) {
    return { text: `VISITE DANS ${days}J`, color: "bg-red-500", urgent: true };
  } else if (days <= 7) {
    return { text: `Visite dans ${days}j`, color: "bg-orange-500", urgent: true };
  } else if (days <= 14) {
    return { text: `Visite le ${nextVisit.toLocaleDateString(APP_CONFIG.locale, { day: "2-digit", month: "2-digit" })}`, color: "bg-amber-500", urgent: false };
  } else {
    return { text: `Visite le ${nextVisit.toLocaleDateString(APP_CONFIG.locale, { day: "2-digit", month: "2-digit" })}`, color: "bg-green-500", urgent: false };
  }
}

function getOpportunityBadge(potentialGain: number): { text: string; color: string } | null {
  if (potentialGain > 100000) {
    return { text: "🌟 EXCEPTIONNEL", color: "text-emerald-500" };
  } else if (potentialGain > 50000) {
    return { text: "⭐ OPPORTUNITÉ", color: "text-amber-500" };
  } else if (potentialGain > 20000) {
    return { text: "✨ INTÉRESSANT", color: "text-blue-500" };
  }
  return null;
}

export default function AnalysisPage() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState("potentialGain");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [onlyAnalyzed, setOnlyAnalyzed] = useState(true); // Default: show only analyzed

  const { data, isLoading, error, refetch } = useProperties(
    {}, // filters
    {   // pagination
      page: 1,
      limit: 100,
      sortBy: "discountPercent",
      sortOrder: "desc",
    }
  );


  // Process and enrich properties with calculated fields
  const enrichedProperties = useMemo(() => {
    if (!data?.data) return [];

    return data.data.map((p) => {
      const nextVisit = getNextVisitDate(p.visitDates || []);
      const potentialGain = (p.marketPrice && p.startingPrice)
        ? p.marketPrice - p.startingPrice
        : 0;

      return {
        ...p,
        nextVisit,
        potentialGain,
        visitBadge: getVisitBadge(p.visitDates || []),
        opportunityBadge: getOpportunityBadge(potentialGain),
      };
    });
  }, [data?.data]);

  // Filter by allowed courts (empty patterns = allow all)
  const isCourtAllowed = (court: string | null | undefined): boolean => {
    const patterns = APP_CONFIG.allowedCourtPatterns || [];
    // If no patterns configured, allow all
    if (patterns.length === 0) return true;
    // If patterns configured but no court, reject
    if (!court) return false;
    const courtLower = court.toLowerCase();
    return patterns.some(p => courtLower.includes(p));
  };

  // Filter and sort properties
  const filteredProperties = useMemo(() => {
    return enrichedProperties
      .filter((p) => {
        // Court filter: only TJ Marseille, TJ Toulon, TJ Aix
        if (!isCourtAllowed(p.court)) return false;
        // Only analyzed filter
        if (onlyAnalyzed && !p.marketPrice) return false;
        // Type filter
        if (typeFilter !== "all" && p.propertyType !== typeFilter) return false;
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const searchFields = [
            p.address,
            p.city,
            p.postalCode,
            p.description,
          ].filter(Boolean).join(" ").toLowerCase();
          if (!searchFields.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let aVal: number | Date | null = null;
        let bVal: number | Date | null = null;

        switch (sortBy) {
          case "potentialGain":
            aVal = a.potentialGain;
            bVal = b.potentialGain;
            break;
          case "discountPercent":
            aVal = a.discountPercent || 0;
            bVal = b.discountPercent || 0;
            break;
          case "nextVisit":
            aVal = a.nextVisit?.getTime() ?? Infinity;
            bVal = b.nextVisit?.getTime() ?? Infinity;
            break;
          case "pricePerSqm":
            aVal = a.pricePerSqm || Infinity;
            bVal = b.pricePerSqm || Infinity;
            break;
          case "startingPrice":
            aVal = a.startingPrice || Infinity;
            bVal = b.startingPrice || Infinity;
            break;
          case "auctionDate":
            aVal = a.auctionDate ? new Date(a.auctionDate).getTime() : Infinity;
            bVal = b.auctionDate ? new Date(b.auctionDate).getTime() : Infinity;
            break;
          default:
            aVal = a.potentialGain;
            bVal = b.potentialGain;
        }

        const multiplier = sortOrder === "desc" ? -1 : 1;
        return ((aVal as number) - (bVal as number)) * multiplier;
      });
  }, [enrichedProperties, sortBy, sortOrder, typeFilter, searchQuery, onlyAnalyzed]);

  // Stats
  const stats = useMemo(() => {
    const withVisits = filteredProperties.filter((p) => p.nextVisit).length;
    const highGain = filteredProperties.filter((p) => p.potentialGain > 50000).length;
    const highDiscount = filteredProperties.filter((p) => (p.discountPercent || 0) >= 30).length;
    const totalPotential = filteredProperties.reduce((sum, p) => sum + Math.max(0, p.potentialGain), 0);

    return {
      total: filteredProperties.length,
      withVisits,
      highGain,
      highDiscount,
      totalPotential,
    };
  }, [filteredProperties]);

  const handleSort = (value: string) => {
    const [newSortBy, newSortOrder] = value.split(":");
    setSortBy(newSortBy);
    setSortOrder(newSortOrder as "asc" | "desc");
    setShowSortDropdown(false);
  };

  const getBorderColor = (potentialGain: number) => {
    if (potentialGain > 100000) return "border-l-emerald-500";
    if (potentialGain > 50000) return "border-l-amber-500";
    if (potentialGain > 20000) return "border-l-blue-500";
    return "border-l-gray-300";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⭐ Opportunités</h1>
          <p className="text-gray-500">
            Analyse des biens par gain potentiel et prochaines visites
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Rafraîchir les données
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <strong>Erreur:</strong> {String(error)}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardWithTrend
          title="Avec visite programmée"
          value={stats.withVisits}
          icon={<Calendar size={24} />}
          tooltip="Biens avec une visite à venir"
        />
        <MetricCardWithTrend
          title="Gain potentiel > 50k€"
          value={stats.highGain}
          icon={<TrendingUp size={24} />}
          tooltip="Nombre de biens avec gain > 50 000€"
        />
        <MetricCardWithTrend
          title="Décote > 30%"
          value={stats.highDiscount}
          icon={<TrendingDown size={24} />}
          tooltip="Biens avec décote supérieure à 30%"
        />
        <MetricCardWithTrend
          title="Potentiel total"
          value={`${Math.round(stats.totalPotential / 1000)}k €`}
          icon={<Gem size={24} />}
          tooltip="Somme des gains potentiels"
        />
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une adresse, ville..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {typeFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Only analyzed toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAnalyzed}
              onChange={(e) => setOnlyAnalyzed(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">Avec analyse de prix</span>
          </label>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              <ArrowUpDown size={16} />
              Trier
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSort(option.value)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                      `${sortBy}:${sortOrder}` === option.value ? "text-primary-600 bg-primary-50" : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="flex gap-8">
                <div className="h-12 bg-gray-200 rounded w-24"></div>
                <div className="h-12 bg-gray-200 rounded w-24"></div>
                <div className="h-12 bg-gray-200 rounded w-24"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredProperties.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={48} />}
          title="Aucun bien trouvé"
          description="Modifiez vos filtres pour voir plus de résultats."
        />
      ) : (
        <div className="space-y-4">
          {filteredProperties.map((property) => (
            <div
              key={property.id}
              onClick={() => router.push(`/auctions/${property.id}`)}
              className={`bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-primary-200 transition-all cursor-pointer border-l-4 ${getBorderColor(property.potentialGain)}`}
            >
              {/* Header row with title and badges */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${TYPE_BG[property.propertyType] || TYPE_BG.other} flex items-center justify-center text-white`}>
                    {TYPE_ICONS[property.propertyType] || TYPE_ICONS.other}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">
                      {TYPE_LABELS[property.propertyType] || "Bien"} à {property.city || "Ville N/C"}
                    </h3>
                    <p className="text-sm text-gray-500">{property.address || "Adresse non disponible"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {property.visitBadge && (
                    <span className={`${property.visitBadge.color} text-white text-xs font-semibold px-3 py-1 rounded-full`}>
                      {property.visitBadge.urgent ? "🔴 " : "🟢 "}{property.visitBadge.text}
                    </span>
                  )}
                  {property.opportunityBadge && (
                    <span className={`${property.opportunityBadge.color} font-semibold text-sm`}>
                      {property.opportunityBadge.text}
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
                {/* Starting price */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Mise à prix</p>
                  <p className="text-lg font-bold text-gray-900">
                    {property.startingPrice ? formatCurrency(property.startingPrice, "EUR") : "N/C"}
                  </p>
                </div>

                {/* Market value */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Valeur marché</p>
                  <p className="text-lg font-bold text-gray-900">
                    {property.marketPrice ? formatCurrency(property.marketPrice, "EUR") : "N/C"}
                  </p>
                </div>

                {/* Potential gain */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">💰 Gain potentiel</p>
                  <p className={`text-lg font-bold ${property.potentialGain > 50000 ? "text-emerald-600" : property.potentialGain > 20000 ? "text-amber-600" : "text-gray-700"}`}>
                    {property.potentialGain > 0 ? `+${formatCurrency(property.potentialGain, "EUR")}` : "N/C"}
                  </p>
                </div>

                {/* Discount */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">📉 Décote</p>
                  <p className={`text-lg font-bold ${(property.discountPercent || 0) >= 30 ? "text-emerald-600" : (property.discountPercent || 0) >= 20 ? "text-amber-600" : "text-gray-700"}`}>
                    {property.discountPercent ? `${Math.round(property.discountPercent)}%` : "N/C"}
                  </p>
                </div>

                {/* Surface */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">📐 Surface</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {property.surface ? `${property.surface} m²` : "N/C"}
                  </p>
                </div>
              </div>

              {/* Footer row with auction date and actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  {property.auctionDate && (
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      Vente le {new Date(property.auctionDate).toLocaleDateString(APP_CONFIG.locale)}
                    </span>
                  )}
                  {property.pricePerSqm && (
                    <span className="flex items-center gap-1">
                      <Maximize2 size={14} />
                      {Math.round(property.pricePerSqm)} €/m²
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {property.url && (
                    <a
                      href={property.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      <ExternalLink size={12} />
                      Source
                    </a>
                  )}
                  {property.lawyerEmail && (
                    <a
                      href={`mailto:${property.lawyerEmail}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      <Mail size={12} />
                      Avocat
                    </a>
                  )}
                  <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
                    <Eye size={12} />
                    Analyse détaillée
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Comment utiliser cette page ?</h4>
            <p className="text-sm text-blue-700 mt-1">
              Cette page affiche les opportunités triées par <strong>gain potentiel</strong> (valeur marché - mise à prix).
              Les badges de visite indiquent l'urgence :
              <span className="inline-block ml-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">rouge</span> = visite dans 3 jours,
              <span className="inline-block ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">orange</span> = 7 jours,
              <span className="inline-block ml-1 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">vert</span> = plus tard.
            </p>
            <p className="text-sm text-blue-700 mt-2">
              <strong>Cliquez sur un bien</strong> pour voir l'analyse détaillée avec comparaison aux transactions DVF du secteur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
