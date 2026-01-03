"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  OpportunityBadge,
  formatCurrency,
} from "@repo/ui";
import { OpportunityLevel } from "@repo/types";
import { useProperty } from "@repo/api-client";
import { APP_CONFIG } from "@/lib/config";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Building2,
  Gavel,
  ExternalLink,
  TrendingDown,
  BarChart3,
  Info,
  FileText,
  Eye,
  ChevronDown,
  ChevronUp,
  Home,
  Calculator,
  Target,
  AlertCircle,
  Thermometer,
  Mail,
} from "lucide-react";

interface Comparable {
  date?: string;
  price?: number;
  surface?: number;
  price_per_sqm?: number;
  pricePerSqm?: number;
  address?: string;
  property_type?: string;
  title?: string;
  url?: string;
  source?: string;
  year?: string;
  prix_m2?: number;
  nb_mutations?: number;
}

interface SourceEstimate {
  source_name: string;
  prix_m2: number;
  nb_data_points: number;
  confidence: number;
  notes: string;
  comparables: Comparable[];
  source_url?: string;
}

interface TensionLocative {
  tension: string;
  niveau: number;
  label: string;
  nom?: string;
  communes_tendues?: number;
}

interface MultiSourceAnalysis {
  postal_code: string;
  city: string;
  property_type: string;
  surface: number | null;
  starting_price: number | null;
  sources: {
    dvf: SourceEstimate | null;
    commune: SourceEstimate | null;
    listings: SourceEstimate | null;
    meilleursagents: SourceEstimate | null;
  };
  tension_locative: TensionLocative | null;
  combined: {
    prix_m2_recommended: number | null;
    prix_total_estimated: number | null;
    discount_percent: number | null;
    potential_gain: number | null;
    prix_m2_min: number | null;
    prix_m2_max: number | null;
  };
  reliability: string;
  sources_agreement: number;
  analysis_notes: string[];
  warnings: string[];
  analyzed_at: string;
  error?: string;
}

interface PropertyData {
  id: string;
  source: string;
  url: string;
  address: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  propertyType: string;
  surface: number | null;
  rooms: number | null;
  description: string;
  descriptionDetailed: string | null;
  court: string;
  lawyerName: string | null;
  lawyerEmail: string | null;
  auctionDate: string | null;
  startingPrice: number | null;
  marketPrice: number | null;
  discountPercent: number | null;
  opportunityLevel: string;
  visitDates: string[];
  photos: string[];
  documents: { type: string; name: string; url: string }[];
  pvUrl: string | null;
  pricePerSqm: number | null;
}


// Check if we're in static mode (no API)
const IS_STATIC_MODE = process.env.NEXT_PUBLIC_STATIC_MODE === "true";

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  // Use the hook that supports both API and static modes
  const { data: propertyData, isLoading } = useProperty(propertyId);
  const property = propertyData as PropertyData | null;

  const [analysisData, setAnalysisData] = useState<MultiSourceAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>("dvf");
  const [activeTab, setActiveTab] = useState<"overview" | "analysis" | "documents">("overview");

  // Load analysis data (from pre-computed static data or API)
  useEffect(() => {
    // In static mode, use pre-computed analysis from property data
    if (IS_STATIC_MODE) {
      const staticAnalysis = (propertyData as any)?.analysis;
      if (staticAnalysis) {
        setAnalysisData(staticAnalysis as MultiSourceAnalysis);
      }
      return;
    }

    // In API mode, fetch from server
    async function fetchAnalysis() {
      setIsLoadingAnalysis(true);
      try {
        const res = await fetch(`/api/properties/${propertyId}/multi-source-analysis`);
        if (res.ok) {
          const data = await res.json();
          setAnalysisData(data);
        }
      } catch (err) {
        console.error("Failed to fetch multi-source analysis:", err);
      } finally {
        setIsLoadingAnalysis(false);
      }
    }
    if (propertyId) {
      fetchAnalysis();
    }
  }, [propertyId, propertyData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-gray-200 rounded-xl animate-pulse"></div>
            <div className="h-96 bg-gray-200 rounded-xl animate-pulse"></div>
          </div>
          <div className="h-96 bg-gray-200 rounded-xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="space-y-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft size={20} />
          Retour
        </button>
        <div className="bg-white rounded-xl p-8 text-center">
          <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Bien non trouvé</h2>
          <p className="text-gray-500">Ce bien n'existe pas ou a été supprimé.</p>
        </div>
      </div>
    );
  }

  const combined = analysisData?.combined;
  const sources = analysisData?.sources;

  // Generate mailto link for document request
  const generateDocumentRequestEmail = () => {
    if (!property) return "";

    const auctionDateStr = property.auctionDate
      ? new Date(property.auctionDate).toLocaleDateString(APP_CONFIG.locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "à venir";

    const subject = encodeURIComponent(
      `Demande de documents - ${property.address}, ${property.postalCode} ${property.city}`
    );

    const body = encodeURIComponent(
`Maître,

Je me permets de vous contacter au sujet de la vente aux enchères prévue le ${auctionDateStr} concernant le bien situé :

${property.address}
${property.postalCode} ${property.city}

Souhaitant participer à cette vente, je vous serais reconnaissant(e) de bien vouloir me transmettre les documents suivants :

- Le cahier des conditions de vente
- Le procès-verbal de description
- Les diagnostics immobiliers (DPE, amiante, plomb, etc.)
- Les photos du bien (si disponibles)
- Tout autre document utile à la connaissance du bien

Je reste à votre disposition pour tout renseignement complémentaire.

Dans l'attente de votre retour, je vous prie d'agréer, Maître, l'expression de mes salutations distinguées.

Cordialement`
    );

    const email = property.lawyerEmail || "";
    return `mailto:${email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {property.address || "Adresse non disponible"}
              {property.opportunityLevel && property.opportunityLevel !== "none" && (
                <OpportunityBadge level={property.opportunityLevel as OpportunityLevel} />
              )}
            </h1>
            <div className="flex items-center gap-2 text-gray-500">
              <MapPin size={14} />
              <span>{property.city} {property.postalCode}</span>
            </div>
          </div>
        </div>
        {property.url && (
          <a
            href={property.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <ExternalLink size={16} />
            Voir l'annonce originale
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
            activeTab === "overview"
              ? "text-primary-600 border-primary-600"
              : "text-gray-500 border-transparent hover:text-gray-700"
          }`}
        >
          Apercu
        </button>
        {/* Analysis tab - show if we have analysis data (API or pre-computed) */}
        <button
          onClick={() => setActiveTab("analysis")}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
            activeTab === "analysis"
              ? "text-primary-600 border-primary-600"
              : "text-gray-500 border-transparent hover:text-gray-700"
          }`}
        >
          Analyse de prix
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
            activeTab === "documents"
              ? "text-primary-600 border-primary-600"
              : "text-gray-500 border-transparent hover:text-gray-700"
          }`}
        >
          Documents
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photos */}
            {property.photos && property.photos.length > 0 && (
              <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-1">
                  {property.photos.slice(0, 6).map((photo, index) => (
                    <div key={index} className="relative aspect-video bg-gray-100 rounded overflow-hidden">
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder-property.jpg";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mini Map */}
            {property.latitude && property.longitude && (
              <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
                <div className="relative h-64">
                  <iframe
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(property.longitude) - 0.008},${Number(property.latitude) - 0.006},${Number(property.longitude) + 0.008},${Number(property.latitude) + 0.006}&layer=mapnik&marker=${property.latitude},${property.longitude}`}
                    className="w-full h-full border-0"
                    loading="lazy"
                    title={`Carte ${property.address}`}
                  />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg text-sm text-blue-600 font-medium shadow-md transition-colors flex items-center gap-2 border border-gray-200"
                  >
                    <MapPin size={16} />
                    Ouvrir dans Google Maps
                  </a>
                </div>
                <div className="p-3 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={14} className="text-gray-400" />
                    <span>{property.address}, {property.postalCode} {property.city}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">Prix de départ</div>
                <div className="text-xl font-bold text-gray-900">
                  {property.startingPrice ? formatCurrency(property.startingPrice, "EUR") : "N/C"}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">Surface</div>
                <div className="text-xl font-bold text-gray-900">
                  {property.surface ? `${property.surface} m²` : "N/C"}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">Prix/m²</div>
                <div className="text-xl font-bold text-gray-900">
                  {property.pricePerSqm ? `${Math.round(property.pricePerSqm)} €` : "N/C"}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">Type</div>
                <div className="text-xl font-bold text-gray-900 capitalize">
                  {property.propertyType || "N/C"}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3">Description</h3>
              <p className="text-gray-600 whitespace-pre-wrap">
                {property.descriptionDetailed || property.description || "Aucune description disponible."}
              </p>
            </div>

            {/* Visit dates */}
            {property.visitDates && property.visitDates.length > 0 && (
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Eye className="text-green-600" size={20} />
                  Dates de visite
                </h3>
                <div className="flex flex-wrap gap-2">
                  {property.visitDates.map((date, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm"
                    >
                      {date}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Auction info */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Informations enchère</h3>
              <div className="space-y-3">
                {property.auctionDate && (
                  <div className="flex items-center gap-3">
                    <Calendar size={18} className="text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500">Date de vente</div>
                      <div className="font-medium">
                        {new Date(property.auctionDate).toLocaleDateString(APP_CONFIG.locale, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {property.court && (
                  <div className="flex items-center gap-3">
                    <Gavel size={18} className="text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500">Tribunal</div>
                      <div className="font-medium">{property.court}</div>
                    </div>
                  </div>
                )}
                {property.lawyerName && (
                  <div className="flex items-center gap-3">
                    <Building2 size={18} className="text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500">Avocat</div>
                      <div className="font-medium">{property.lawyerName}</div>
                      {property.lawyerEmail && (
                        <a href={`mailto:${property.lawyerEmail}`} className="text-sm text-primary-600">
                          {property.lawyerEmail}
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {/* Email button for document request */}
                <a
                  href={generateDocumentRequestEmail()}
                  className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  <Mail size={18} />
                  Demander les documents
                </a>
              </div>
            </div>

            {/* Tension locative */}
            {analysisData?.tension_locative && analysisData.tension_locative.niveau > 0 && (
              <div className={`rounded-xl p-4 border ${
                analysisData.tension_locative.niveau >= 3
                  ? "bg-red-50 border-red-200"
                  : analysisData.tension_locative.niveau >= 2
                    ? "bg-orange-50 border-orange-200"
                    : "bg-yellow-50 border-yellow-200"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    analysisData.tension_locative.niveau >= 3
                      ? "bg-red-100"
                      : analysisData.tension_locative.niveau >= 2
                        ? "bg-orange-100"
                        : "bg-yellow-100"
                  }`}>
                    <Thermometer size={20} className={
                      analysisData.tension_locative.niveau >= 3
                        ? "text-red-600"
                        : analysisData.tension_locative.niveau >= 2
                          ? "text-orange-600"
                          : "text-yellow-600"
                    } />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Tension locative</div>
                    <div className={`text-sm ${
                      analysisData.tension_locative.niveau >= 3
                        ? "text-red-700"
                        : analysisData.tension_locative.niveau >= 2
                          ? "text-orange-700"
                          : "text-yellow-700"
                    }`}>
                      {analysisData.tension_locative.label}
                    </div>
                    {analysisData.tension_locative.communes_tendues && (
                      <div className="text-xs text-gray-500 mt-1">
                        {analysisData.tension_locative.communes_tendues} communes en zone tendue
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  {[1, 2, 3].map((level) => (
                    <div
                      key={level}
                      className={`h-2 flex-1 rounded-full ${
                        level <= analysisData.tension_locative!.niveau
                          ? level >= 3
                            ? "bg-red-500"
                            : level >= 2
                              ? "bg-orange-500"
                              : "bg-yellow-500"
                          : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Faible</span>
                  <span>Élevée</span>
                </div>
              </div>
            )}

            {/* Quick analysis summary */}
            {combined && combined.discount_percent != null && combined.discount_percent > 0 && (
              <div className={`rounded-xl p-6 border ${
                combined.discount_percent >= 30
                  ? "bg-green-50 border-green-200"
                  : combined.discount_percent >= 20
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-gray-50 border-gray-200"
              }`}>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target size={20} className={
                    combined.discount_percent >= 30 ? "text-green-600" : "text-yellow-600"
                  } />
                  Opportunité détectée
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Décote estimée</span>
                    <span className={`font-bold ${
                      combined.discount_percent >= 30 ? "text-green-600" : "text-yellow-600"
                    }`}>
                      -{Math.round(combined.discount_percent)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valeur marché</span>
                    <span className="font-medium">{formatCurrency(combined.prix_total_estimated || 0, "EUR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gain potentiel</span>
                    <span className="font-bold text-green-600">{formatCurrency(combined.potential_gain || 0, "EUR")}</span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("analysis")}
                  className="mt-4 w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <BarChart3 size={16} />
                  Voir l'analyse détaillée
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysis Tab */}
      {activeTab === "analysis" && (
        <div className="space-y-6">
          {isLoadingAnalysis ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Analyse multi-sources en cours...</p>
            </div>
          ) : analysisData?.error ? (
            <div className="bg-yellow-50 rounded-xl p-6 border border-yellow-200">
              <div className="flex items-center gap-3 text-yellow-700">
                <AlertCircle size={24} />
                <div>
                  <h3 className="font-semibold">Analyse non disponible</h3>
                  <p className="text-sm">{analysisData.error}</p>
                </div>
              </div>
            </div>
          ) : analysisData ? (
            <>
              {/* Combined recommendation */}
              {combined && combined.prix_m2_recommended && (
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Calculator size={20} className="text-primary-600" />
                    Estimation combinée (3 sources)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Auction price */}
                    <div className="text-center p-4 bg-blue-50 rounded-xl">
                      <div className="text-sm text-blue-600 mb-1">Prix enchère/m²</div>
                      <div className="text-2xl font-bold text-blue-700">
                        {property.pricePerSqm ? Math.round(property.pricePerSqm) : "N/C"} €
                      </div>
                    </div>

                    {/* vs */}
                    <div className="flex items-center justify-center">
                      <div className="text-center">
                        {combined.discount_percent != null && (
                          <>
                            <TrendingDown size={32} className={
                              combined.discount_percent > 0 ? "text-green-500" : "text-red-500"
                            } />
                            <div className={`text-3xl font-bold ${
                              combined.discount_percent > 0 ? "text-green-600" : "text-red-600"
                            }`}>
                              {combined.discount_percent > 0 ? "-" : "+"}{Math.abs(Math.round(combined.discount_percent))}%
                            </div>
                            <div className="text-sm text-gray-500">vs marché</div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Market price */}
                    <div className="text-center p-4 bg-gray-50 rounded-xl">
                      <div className="text-sm text-gray-600 mb-1">Prix marché/m²</div>
                      <div className="text-2xl font-bold text-gray-700">
                        {Math.round(combined.prix_m2_recommended)} €
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        ({combined.prix_m2_min} - {combined.prix_m2_max} €)
                      </div>
                    </div>
                  </div>

                  {/* Calculation details */}
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Prix de départ</div>
                        <div className="font-medium">{formatCurrency(property.startingPrice || 0, "EUR")}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Surface</div>
                        <div className="font-medium">{property.surface || "N/C"} m²</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Valeur marché estimée</div>
                        <div className="font-medium">{formatCurrency(combined.prix_total_estimated || 0, "EUR")}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Gain potentiel</div>
                        <div className="font-bold text-green-600">
                          {combined.potential_gain && combined.potential_gain > 0
                            ? formatCurrency(combined.potential_gain, "EUR")
                            : "-"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Info size={14} />
                        <span>
                          Fiabilité: {analysisData.reliability === "high" ? "Élevée" : analysisData.reliability === "medium" ? "Moyenne" : "Faible"}
                          {" "}• Accord sources: {analysisData.sources_agreement}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {analysisData.warnings && analysisData.warnings.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                      {analysisData.warnings.map((warning, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-yellow-700">
                          <AlertCircle size={14} />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tension locative in analysis tab */}
              {analysisData?.tension_locative && (
                <div className={`rounded-xl p-6 border ${
                  analysisData.tension_locative.niveau >= 3
                    ? "bg-red-50 border-red-200"
                    : analysisData.tension_locative.niveau >= 2
                      ? "bg-orange-50 border-orange-200"
                      : analysisData.tension_locative.niveau >= 1
                        ? "bg-yellow-50 border-yellow-200"
                        : "bg-gray-50 border-gray-200"
                }`}>
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Thermometer size={20} className={
                      analysisData.tension_locative.niveau >= 3
                        ? "text-red-600"
                        : analysisData.tension_locative.niveau >= 2
                          ? "text-orange-600"
                          : analysisData.tension_locative.niveau >= 1
                            ? "text-yellow-600"
                            : "text-gray-400"
                    } />
                    Tension locative
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                          analysisData.tension_locative.niveau >= 3
                            ? "bg-red-100 text-red-700"
                            : analysisData.tension_locative.niveau >= 2
                              ? "bg-orange-100 text-orange-700"
                              : analysisData.tension_locative.niveau >= 1
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-700"
                        }`}>
                          {analysisData.tension_locative.label}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3].map((level) => (
                            <div
                              key={level}
                              className={`h-3 flex-1 rounded ${
                                level <= analysisData.tension_locative!.niveau
                                  ? level >= 3
                                    ? "bg-red-500"
                                    : level >= 2
                                      ? "bg-orange-500"
                                      : "bg-yellow-500"
                                  : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Non tendue</span>
                          <span>Tendue</span>
                          <span>Très tendue</span>
                        </div>
                      </div>

                      {analysisData.tension_locative.communes_tendues && (
                        <p className="text-sm text-gray-600">
                          {analysisData.tension_locative.communes_tendues} communes en zone tendue dans ce département
                        </p>
                      )}
                    </div>

                    <div className={`p-4 rounded-lg ${
                      analysisData.tension_locative.niveau >= 2 ? "bg-white/50" : "bg-gray-50"
                    }`}>
                      <h4 className="font-medium text-gray-900 mb-2">Ce que cela signifie</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {analysisData.tension_locative.niveau >= 2 ? (
                          <>
                            <li>• Forte demande locative</li>
                            <li>• Loyers potentiellement élevés</li>
                            <li>• Réglementation spécifique (encadrement des loyers possible)</li>
                            <li>• Taxe sur les logements vacants applicable</li>
                          </>
                        ) : analysisData.tension_locative.niveau >= 1 ? (
                          <>
                            <li>• Demande locative modérée</li>
                            <li>• Quelques communes tendues dans le département</li>
                            <li>• Potentiel locatif à étudier</li>
                          </>
                        ) : (
                          <>
                            <li>• Marché locatif équilibré</li>
                            <li>• Pas de réglementation spécifique</li>
                            <li>• Rentabilité à analyser au cas par cas</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Price position visualization */}
              {property.pricePerSqm && combined?.prix_m2_min && combined?.prix_m2_max && (
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-primary-600" />
                    Position du prix
                  </h3>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="relative h-6 bg-gradient-to-r from-green-400 via-yellow-400 to-red-400 rounded-full">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center"
                        style={{
                          left: `${Math.min(Math.max(
                            ((property.pricePerSqm - combined.prix_m2_min) /
                             (combined.prix_m2_max - combined.prix_m2_min)) * 100,
                          0), 100)}%`,
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        <span className="text-white text-xs font-bold">€</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600 mt-2">
                      <span className="text-green-600 font-medium">{combined.prix_m2_min} €/m²</span>
                      <span className="text-primary-600 font-bold">Enchère: {Math.round(property.pricePerSqm)} €/m²</span>
                      <span className="text-red-600 font-medium">{combined.prix_m2_max} €/m²</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Three sources comparison */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">Détail des 3 sources</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* DVF Source */}
                  <div className={`rounded-xl border-2 transition-all ${
                    sources?.dvf ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-gray-50"
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-700">DVF Transactions</span>
                        {sources?.dvf && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                            {sources.dvf.nb_data_points} ventes
                          </span>
                        )}
                      </div>
                      {sources?.dvf ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900">{Math.round(sources.dvf.prix_m2)} €/m²</div>
                          <div className="text-xs text-gray-500 mt-1">{sources.dvf.notes}</div>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${sources.dvf.confidence}%`}}></div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Confiance: {Math.round(sources.dvf.confidence)}%</div>
                        </>
                      ) : (
                        <div className="text-gray-400 text-sm">Données non disponibles</div>
                      )}
                    </div>
                  </div>

                  {/* Commune Source */}
                  <div className={`rounded-xl border-2 transition-all ${
                    sources?.commune ? "border-green-200 bg-green-50/50" : "border-gray-200 bg-gray-50"
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-700">Indicateurs Commune</span>
                        {sources?.commune && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            {sources.commune.nb_data_points} données
                          </span>
                        )}
                      </div>
                      {sources?.commune ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900">{Math.round(sources.commune.prix_m2)} €/m²</div>
                          <div className="text-xs text-gray-500 mt-1">{sources.commune.notes}</div>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{width: `${sources.commune.confidence}%`}}></div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Confiance: {Math.round(sources.commune.confidence)}%</div>
                        </>
                      ) : (
                        <div className="text-gray-400 text-sm">Données non disponibles</div>
                      )}
                    </div>
                  </div>

                  {/* Listings Source */}
                  <div className={`rounded-xl border-2 transition-all ${
                    sources?.listings ? "border-purple-200 bg-purple-50/50" : "border-gray-200 bg-gray-50"
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-purple-700">Annonces en ligne</span>
                        {sources?.listings && (
                          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                            {sources.listings.nb_data_points} annonces
                          </span>
                        )}
                      </div>
                      {sources?.listings ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900">{Math.round(sources.listings.prix_m2)} €/m²</div>
                          <div className="text-xs text-gray-500 mt-1">{sources.listings.notes}</div>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-purple-500 h-1.5 rounded-full" style={{width: `${sources.listings.confidence}%`}}></div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Confiance: {Math.round(sources.listings.confidence)}%</div>
                        </>
                      ) : (
                        <div className="text-gray-400 text-sm">Données non disponibles</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* DVF Transactions (expandable) */}
              {sources?.dvf && sources.dvf.comparables.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedSource(expandedSource === "dvf" ? null : "dvf")}
                    className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50"
                  >
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                      Transactions DVF ({sources.dvf.comparables.length})
                    </h3>
                    {expandedSource === "dvf" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  {expandedSource === "dvf" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-gray-600">Date</th>
                            <th className="px-4 py-3 text-left text-gray-600">Adresse</th>
                            <th className="px-4 py-3 text-right text-gray-600">Prix</th>
                            <th className="px-4 py-3 text-right text-gray-600">Surface</th>
                            <th className="px-4 py-3 text-right text-gray-600">Prix/m²</th>
                            <th className="px-4 py-3 text-center text-gray-600">Carte</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sources.dvf.comparables.map((tx, index) => {
                            const searchQuery = encodeURIComponent(
                              `${tx.address || ""}, ${property.postalCode} ${property.city}`
                            );
                            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
                            return (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-gray-500">
                                  {tx.date ? new Date(tx.date).toLocaleDateString(APP_CONFIG.locale) : "-"}
                                </td>
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {tx.address || "-"}
                                </td>
                                <td className="px-4 py-3 text-right font-medium">
                                  {tx.price ? formatCurrency(tx.price, "EUR") : "-"}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-600">
                                  {tx.surface ? `${tx.surface} m²` : "-"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`font-medium ${
                                    property.pricePerSqm && (tx.price_per_sqm || 0) > property.pricePerSqm
                                      ? "text-green-600"
                                      : "text-gray-900"
                                  }`}>
                                    {tx.price_per_sqm ? `${Math.round(tx.price_per_sqm)} €` : "-"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {tx.address && (
                                    <a
                                      href={mapUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                                      title="Voir sur Google Maps"
                                    >
                                      <MapPin size={14} />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Online Listings (expandable) */}
              {sources?.listings && sources.listings.comparables.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedSource(expandedSource === "listings" ? null : "listings")}
                    className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50"
                  >
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                      Annonces similaires ({sources.listings.comparables.length})
                    </h3>
                    {expandedSource === "listings" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  {expandedSource === "listings" && (
                    <div className="divide-y divide-gray-100">
                      {sources.listings.comparables.map((listing, index) => (
                        <div key={index} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 line-clamp-1">{listing.title || "Annonce"}</p>
                              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                {listing.surface && <span>{listing.surface} m²</span>}
                                {listing.source && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{listing.source}</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-gray-900">{listing.price ? formatCurrency(listing.price, "EUR") : "-"}</p>
                              <p className={`text-sm ${
                                property.pricePerSqm && (listing.price_per_sqm || 0) > property.pricePerSqm
                                  ? "text-green-600"
                                  : "text-gray-500"
                              }`}>
                                {listing.price_per_sqm ? `${Math.round(listing.price_per_sqm)} €/m²` : "-"}
                              </p>
                            </div>
                          </div>
                          {listing.url && (
                            <a
                              href={listing.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                            >
                              Voir l'annonce <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Commune historical data (expandable) */}
              {sources?.commune && sources.commune.comparables.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedSource(expandedSource === "commune" ? null : "commune")}
                    className="w-full p-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50"
                  >
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      Historique commune ({sources.commune.comparables.length} ans)
                    </h3>
                    {expandedSource === "commune" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  {expandedSource === "commune" && (
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {sources.commune.comparables.map((data, index) => (
                          <div key={index} className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500">{data.year}</div>
                            <div className="text-lg font-bold text-gray-900">{data.prix_m2} €/m²</div>
                            {data.nb_mutations && (
                              <div className="text-xs text-gray-400">{data.nb_mutations} ventes</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No data at all */}
              {!sources?.dvf && !sources?.commune && !sources?.listings && (
                <div className="bg-gray-50 rounded-xl p-8 text-center">
                  <Home size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Analyse non disponible
                  </h3>
                  <p className="text-gray-500">
                    Aucune donnée n'est disponible pour ce secteur. Vérifiez le code postal du bien.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <Home size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Analyse en cours de chargement
              </h3>
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          {property.documents && property.documents.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Documents disponibles</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {property.documents.map((doc, index) => (
                  <a
                    key={index}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 hover:bg-gray-50"
                  >
                    <FileText size={24} className="text-gray-400" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{doc.name}</div>
                      <div className="text-sm text-gray-500">{doc.type}</div>
                    </div>
                    <ExternalLink size={16} className="text-gray-400" />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun document</h3>
              <p className="text-gray-500 mb-6">
                Aucun document n'est disponible pour ce bien. Vous pouvez contacter l'avocat pour les obtenir.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={generateDocumentRequestEmail()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Mail size={16} />
                  Demander les documents par email
                </a>
                {property.pvUrl && (
                  <a
                    href={property.pvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FileText size={16} />
                    Voir le PV de description
                  </a>
                )}
              </div>
            </div>
          )}

          {property.pvUrl && property.documents && property.documents.length > 0 && (
            <a
              href={property.pvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200 hover:bg-blue-100"
            >
              <FileText size={24} className="text-blue-600" />
              <div className="flex-1">
                <div className="font-medium text-blue-900">Procès-verbal de description</div>
                <div className="text-sm text-blue-700">Document officiel du tribunal</div>
              </div>
              <ExternalLink size={16} className="text-blue-600" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
