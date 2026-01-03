"use client";

import { useState, useMemo, useCallback } from "react";
import { useIncompleteProperties } from "@repo/api-client";
import { formatCurrency, formatDate } from "@repo/ui";
import { APP_CONFIG } from "@/lib/config";
import type { PropertyAuction } from "@repo/types";
import {
  ExternalLink,
  AlertTriangle,
  DollarSign,
  MapPin,
  Ruler,
  Calendar,
  Building2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Mail,
  Filter,
} from "lucide-react";

interface DataIssue {
  field: string;
  label: string;
  icon: React.ReactNode;
}

const DATA_ISSUES: DataIssue[] = [
  { field: "price", label: "Prix manquant", icon: <DollarSign size={14} /> },
  { field: "city", label: "Ville manquante", icon: <MapPin size={14} /> },
  { field: "surface", label: "Surface manquante", icon: <Ruler size={14} /> },
  { field: "postalCode", label: "Code postal manquant", icon: <Building2 size={14} /> },
];

function getIssues(property: PropertyAuction): DataIssue[] {
  const issues: DataIssue[] = [];
  if (!property.startingPrice || property.startingPrice === 0) {
    issues.push(DATA_ISSUES[0]);
  }
  if (!property.city || property.city.trim() === "") {
    issues.push(DATA_ISSUES[1]);
  }
  if (!property.surface || property.surface === 0) {
    issues.push(DATA_ISSUES[2]);
  }
  if (!property.postalCode || property.postalCode.trim() === "") {
    issues.push(DATA_ISSUES[3]);
  }
  return issues;
}

export default function DataQualityPage() {
  const { data, isLoading, refetch, isRefetching } = useIncompleteProperties(100);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [markedAsFixed, setMarkedAsFixed] = useState<Set<string>>(new Set());

  // Helper to check if court is allowed
  const isCourtAllowed = useCallback((court: string | null | undefined): boolean => {
    const patterns = APP_CONFIG.allowedCourtPatterns || [];
    if (patterns.length === 0) return true;
    if (!court) return false;
    const courtLower = court.toLowerCase();
    return patterns.some(p => courtLower.includes(p));
  }, []);

  // Filter by allowed courts and selected issue
  const filteredProperties = useMemo(() => {
    if (!data?.data) return [];

    let result = data.data.filter(p => isCourtAllowed(p.court));

    if (selectedIssue) {
      result = result.filter(p => {
        const issues = getIssues(p);
        return issues.some(i => i.field === selectedIssue);
      });
    }

    // Exclude marked as fixed
    result = result.filter(p => !markedAsFixed.has(p.id));

    return result;
  }, [data?.data, selectedIssue, isCourtAllowed, markedAsFixed]);

  // Count issues by type
  const issueCounts = useMemo(() => {
    if (!data?.data) return {};
    const counts: Record<string, number> = {};
    data.data.filter(p => isCourtAllowed(p.court) && !markedAsFixed.has(p.id)).forEach(p => {
      getIssues(p).forEach(issue => {
        counts[issue.field] = (counts[issue.field] || 0) + 1;
      });
    });
    return counts;
  }, [data?.data, isCourtAllowed, markedAsFixed]);

  const markAsFixed = (id: string) => {
    setMarkedAsFixed(prev => new Set([...prev, id]));
  };

  const handleEmailLawyer = (property: PropertyAuction) => {
    if (!property.lawyerEmail) {
      alert("Pas d'email d'avocat disponible pour cette annonce");
      return;
    }

    const subject = encodeURIComponent(`Demande de documents - Vente du ${property.auctionDate ? formatDate(property.auctionDate, APP_CONFIG.locale) : "à venir"}`);
    const body = encodeURIComponent(`Maître,

Je me permets de vous contacter concernant la vente aux enchères du bien situé :
${property.address}
${property.postalCode ? property.postalCode + " " : ""}${property.city || ""}

Mise à prix : ${property.startingPrice ? formatCurrency(property.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency) : "Non communiquée"}
Date de vente : ${property.auctionDate ? formatDate(property.auctionDate, APP_CONFIG.locale) : "À déterminer"}

Pourriez-vous m'adresser les documents suivants relatifs à cette vente :
- Le cahier des conditions de vente
- Le procès-verbal descriptif
- Les diagnostics techniques
- Le règlement de copropriété (si applicable)

Je vous remercie par avance pour votre retour.

Cordialement,`);

    window.open(`mailto:${property.lawyerEmail}?subject=${subject}&body=${body}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={28} />
            Données à vérifier
          </h1>
          <p className="text-gray-500">
            {filteredProperties.length} annonces avec des données incomplètes
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={18} className={isRefetching ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {/* Issue filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedIssue(null)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            !selectedIssue
              ? "bg-primary-100 text-primary-700 border border-primary-300"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Filter size={14} />
          Tous ({filteredProperties.length})
        </button>
        {DATA_ISSUES.map(issue => (
          <button
            key={issue.field}
            onClick={() => setSelectedIssue(selectedIssue === issue.field ? null : issue.field)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedIssue === issue.field
                ? "bg-amber-100 text-amber-700 border border-amber-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {issue.icon}
            {issue.label} ({issueCounts[issue.field] || 0})
          </button>
        ))}
      </div>

      {/* Properties list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-gray-500">Chargement...</span>
          </div>
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="text-center py-12 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Toutes les données sont complètes !
          </h3>
          <p className="text-gray-500">
            Aucune annonce ne nécessite de vérification pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProperties.map((property, index) => {
            const issues = getIssues(property);

            return (
              <div
                key={property.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow animate-in fade-in"
                style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Property info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 line-clamp-2">
                          {property.address || "Adresse non renseignée"}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                          {property.city && (
                            <span className="flex items-center gap-1">
                              <MapPin size={14} />
                              {property.postalCode} {property.city}
                            </span>
                          )}
                          {property.auctionDate && (
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {formatDate(property.auctionDate, APP_CONFIG.locale)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Issues badges */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {issues.map(issue => (
                        <span
                          key={issue.field}
                          className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full"
                        >
                          {issue.icon}
                          {issue.label}
                        </span>
                      ))}
                    </div>

                    {/* Current data (what we have) */}
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign size={14} className={property.startingPrice ? "text-green-500" : "text-red-500"} />
                        <span className={property.startingPrice ? "text-gray-700" : "text-red-500"}>
                          {property.startingPrice
                            ? formatCurrency(property.startingPrice, APP_CONFIG.locale, APP_CONFIG.currency)
                            : "Prix non renseigné"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Ruler size={14} className={property.surface ? "text-green-500" : "text-red-500"} />
                        <span className={property.surface ? "text-gray-700" : "text-red-500"}>
                          {property.surface ? `${property.surface} m²` : "Surface non renseignée"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin size={14} className={property.city ? "text-green-500" : "text-red-500"} />
                        <span className={property.city ? "text-gray-700" : "text-red-500"}>
                          {property.city || "Ville non renseignée"}
                        </span>
                      </div>
                    </div>

                    {/* Lawyer info if available */}
                    {(property.lawyerName || property.lawyerEmail) && (
                      <div className="mt-3 text-sm text-gray-500">
                        <span className="font-medium">Avocat : </span>
                        {property.lawyerName}
                        {property.lawyerEmail && (
                          <span className="ml-2 text-primary-600">{property.lawyerEmail}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 flex-shrink-0">
                    <a
                      href={property.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
                    >
                      <ExternalLink size={16} />
                      Voir l'annonce
                    </a>

                    {property.lawyerEmail && (
                      <button
                        onClick={() => handleEmailLawyer(property)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                      >
                        <Mail size={16} />
                        Demander docs
                      </button>
                    )}

                    <button
                      onClick={() => markAsFixed(property.id)}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <CheckCircle2 size={16} />
                      Marquer résolu
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Help text */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">Comment utiliser cette page ?</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. Cliquez sur "Voir l'annonce" pour ouvrir l'annonce source</li>
          <li>2. Trouvez les informations manquantes sur la page</li>
          <li>3. Utilisez "Demander docs" pour envoyer un email à l'avocat</li>
          <li>4. Ces données m'aideront à améliorer l'extraction automatique</li>
        </ul>
      </div>
    </div>
  );
}
