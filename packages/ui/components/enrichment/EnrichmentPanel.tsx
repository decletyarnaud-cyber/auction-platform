"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Home,
  MapPin,
  Train,
  School,
  ShoppingBag,
  Heart,
  Building,
  FileText,
  AlertCircle,
  CheckCircle,
  Info,
} from "lucide-react";

interface DVFData {
  market_analysis?: {
    median_price_per_sqm: number;
    avg_price_per_sqm: number;
    transaction_count: number;
    confidence: "high" | "medium" | "low";
  };
  discount_analysis?: {
    discount_percent: number;
    estimated_market_value: number;
    potential_profit: number;
    based_on_transactions: number;
  };
}

interface INSEEData {
  commune?: {
    name: string;
    department: string;
  };
  population?: {
    total: number;
    density: number;
  };
  income?: {
    median: number;
    unemployment_rate: number;
  };
  quality_score?: number;
  investment_attractiveness?: string;
}

interface POIData {
  scores?: {
    transport: number;
    education: number;
    health: number;
    shopping: number;
    overall: number;
    walkability: string;
  };
  nearest_transport?: {
    name: string;
    type: string;
    distance: number;
  };
  poi_counts?: Record<string, number>;
}

interface CadastreData {
  parcel?: {
    surface: number;
    section: string;
    numero: string;
  };
  zone_type?: string;
  built_ratio?: number;
}

interface EnrichmentPanelProps {
  dvf?: DVFData | null;
  insee?: INSEEData | null;
  poi?: POIData | null;
  cadastre?: CadastreData | null;
  loading?: boolean;
  className?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors = {
    high: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level as keyof typeof colors] || colors.low}`}
    >
      {level === "high" ? "Fiable" : level === "medium" ? "Moyen" : "Faible"}
    </span>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const getColor = (s: number) => {
    if (s >= 70) return "bg-green-500";
    if (s >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{Math.round(score)}/100</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(score)} transition-all duration-500`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      {badge}
    </div>
  );
}

export function EnrichmentPanel({
  dvf,
  insee,
  poi,
  cadastre,
  loading = false,
  className = "",
}: EnrichmentPanelProps) {
  if (loading) {
    return (
      <div className={`space-y-4 animate-pulse ${className}`}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 rounded-lg h-32" />
        ))}
      </div>
    );
  }

  const hasData = dvf || insee || poi || cadastre;

  if (!hasData) {
    return (
      <div
        className={`bg-gray-50 rounded-lg p-6 text-center text-gray-500 ${className}`}
      >
        <Info className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>Aucune donnée d'enrichissement disponible</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* DVF Market Analysis */}
      {dvf && (
        <div className="bg-white rounded-lg border p-4">
          <SectionHeader
            icon={TrendingUp}
            title="Prix du Marché (DVF)"
            badge={
              dvf.market_analysis?.confidence && (
                <ConfidenceBadge level={dvf.market_analysis.confidence} />
              )
            }
          />

          {dvf.market_analysis && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 mb-1">Prix médian/m²</p>
                <p className="text-lg font-bold text-blue-900">
                  {formatCurrency(dvf.market_analysis.median_price_per_sqm)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-1">Transactions analysées</p>
                <p className="text-lg font-bold text-gray-900">
                  {dvf.market_analysis.transaction_count}
                </p>
              </div>
            </div>
          )}

          {dvf.discount_analysis && (
            <div
              className={`rounded-lg p-4 ${
                dvf.discount_analysis.discount_percent > 0
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {dvf.discount_analysis.discount_percent > 0 ? (
                  <TrendingDown className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-red-600" />
                )}
                <span
                  className={`text-xl font-bold ${
                    dvf.discount_analysis.discount_percent > 0
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {dvf.discount_analysis.discount_percent > 0 ? "-" : "+"}
                  {Math.abs(dvf.discount_analysis.discount_percent).toFixed(1)}%
                </span>
                <span className="text-sm text-gray-600">vs marché</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Valeur marché estimée</p>
                  <p className="font-semibold">
                    {formatCurrency(dvf.discount_analysis.estimated_market_value)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Gain potentiel</p>
                  <p
                    className={`font-semibold ${
                      dvf.discount_analysis.potential_profit > 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(dvf.discount_analysis.potential_profit)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* INSEE Socio-Economic */}
      {insee && (
        <div className="bg-white rounded-lg border p-4">
          <SectionHeader icon={Users} title="Indicateurs Socio-économiques" />

          {insee.commune && (
            <p className="text-sm text-gray-600 mb-3">
              {insee.commune.name} ({insee.commune.department})
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            {insee.population && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-1">Population</p>
                <p className="font-semibold">
                  {formatNumber(insee.population.total)}
                </p>
                <p className="text-xs text-gray-500">
                  {formatNumber(insee.population.density)} hab/km²
                </p>
              </div>
            )}
            {insee.income && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-1">Revenu médian</p>
                <p className="font-semibold">
                  {formatCurrency(insee.income.median)}/an
                </p>
                <p className="text-xs text-gray-500">
                  Chômage: {insee.income.unemployment_rate}%
                </p>
              </div>
            )}
          </div>

          {insee.quality_score !== undefined && insee.quality_score !== null && (
            <div className="space-y-2">
              <ScoreBar score={insee.quality_score} label="Score de qualité" />
              {insee.investment_attractiveness && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">Attractivité:</span>
                  <span
                    className={`font-medium ${
                      insee.investment_attractiveness === "very_high"
                        ? "text-green-600"
                        : insee.investment_attractiveness === "high"
                          ? "text-blue-600"
                          : insee.investment_attractiveness === "medium"
                            ? "text-yellow-600"
                            : "text-red-600"
                    }`}
                  >
                    {insee.investment_attractiveness === "very_high"
                      ? "Très élevée"
                      : insee.investment_attractiveness === "high"
                        ? "Élevée"
                        : insee.investment_attractiveness === "medium"
                          ? "Moyenne"
                          : "Faible"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* POI Accessibility */}
      {poi && poi.scores && (
        <div className="bg-white rounded-lg border p-4">
          <SectionHeader icon={MapPin} title="Accessibilité & Services" />

          <div className="space-y-3 mb-4">
            <ScoreBar score={poi.scores.transport} label="Transports" />
            <ScoreBar score={poi.scores.education} label="Éducation" />
            <ScoreBar score={poi.scores.health} label="Santé" />
            <ScoreBar score={poi.scores.shopping} label="Commerces" />
          </div>

          <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
            <div>
              <p className="text-sm text-blue-600">Score global</p>
              <p className="text-2xl font-bold text-blue-900">
                {Math.round(poi.scores.overall)}/100
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                poi.scores.walkability === "very_high"
                  ? "bg-green-100 text-green-800"
                  : poi.scores.walkability === "high"
                    ? "bg-blue-100 text-blue-800"
                    : poi.scores.walkability === "medium"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
              }`}
            >
              {poi.scores.walkability === "very_high"
                ? "Très accessible"
                : poi.scores.walkability === "high"
                  ? "Accessible"
                  : poi.scores.walkability === "medium"
                    ? "Moyennement accessible"
                    : "Peu accessible"}
            </div>
          </div>

          {poi.nearest_transport && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <Train className="w-4 h-4" />
              <span>
                {poi.nearest_transport.name} ({poi.nearest_transport.type}) à{" "}
                {poi.nearest_transport.distance}m
              </span>
            </div>
          )}

          {poi.poi_counts && (
            <div className="mt-3 flex flex-wrap gap-2">
              {poi.poi_counts.metro_stations > 0 && (
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                  {poi.poi_counts.metro_stations} métro
                </span>
              )}
              {poi.poi_counts.schools > 0 && (
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                  {poi.poi_counts.schools} écoles
                </span>
              )}
              {poi.poi_counts.healthcare > 0 && (
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                  {poi.poi_counts.healthcare} santé
                </span>
              )}
              {poi.poi_counts.shopping > 0 && (
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                  {poi.poi_counts.shopping} commerces
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cadastre */}
      {cadastre && cadastre.parcel && (
        <div className="bg-white rounded-lg border p-4">
          <SectionHeader icon={Building} title="Données Cadastrales" />

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">Parcelle</p>
              <p className="font-semibold">
                Section {cadastre.parcel.section} n°{cadastre.parcel.numero}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">Surface parcelle</p>
              <p className="font-semibold">
                {formatNumber(cadastre.parcel.surface)} m²
              </p>
            </div>
          </div>

          {cadastre.zone_type && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-gray-600">Zone:</span>
              <span className="font-medium capitalize">{cadastre.zone_type}</span>
            </div>
          )}

          {cadastre.built_ratio !== undefined && cadastre.built_ratio !== null && (
            <div className="mt-3">
              <ScoreBar
                score={cadastre.built_ratio * 100}
                label="Ratio construit"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnrichmentPanel;
