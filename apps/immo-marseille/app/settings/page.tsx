"use client";

import { useState, useEffect, useMemo } from "react";
import { APP_CONFIG } from "@/lib/config";
import { useTriggerScrape, usePropertyStats } from "@repo/api-client";
import { MetricCardWithTrend, EmptyState, saveAlert, type SavedAlert } from "@repo/ui";
import {
  Settings,
  RefreshCw,
  Database,
  MapPin,
  Bell,
  BellOff,
  Plus,
  Edit2,
  Trash2,
  Download,
  History,
  Eye,
  Filter,
  Globe,
  Moon,
  Sun,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  Zap,
  BarChart3,
} from "lucide-react";

const STORAGE_KEYS = {
  ALERTS: "saved-alerts",
  SCRAPE_HISTORY: "scrape-history",
  RECENTLY_VIEWED: "recently-viewed",
  DEFAULT_FILTERS: "default-filters",
  THEME: "theme-preference",
  NOTIFICATIONS: "notification-settings",
};

interface ScrapeHistoryItem {
  id: string;
  timestamp: string;
  status: "success" | "error" | "pending";
  itemsFound: number;
  duration: number;
}

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  newOpportunities: boolean;
  priceDrops: boolean;
  upcomingAuctions: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  emailEnabled: false,
  pushEnabled: true,
  newOpportunities: true,
  priceDrops: true,
  upcomingAuctions: true,
};

export default function SettingsPage() {
  const scrape = useTriggerScrape("/properties");
  const { data: stats } = usePropertyStats();

  // State
  const [alerts, setAlerts] = useState<SavedAlert[]>([]);
  const [scrapeHistory, setScrapeHistory] = useState<ScrapeHistoryItem[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<{ id: string; address: string; viewedAt: string }[]>([]);
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState<SavedAlert | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("alerts");

  // New alert form state
  const [newAlert, setNewAlert] = useState({
    name: "",
    minPrice: "",
    maxPrice: "",
    cities: [] as string[],
    minDiscount: "",
    notifyEmail: false,
    notifyPush: true,
  });

  // Load saved data
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedAlerts = localStorage.getItem(STORAGE_KEYS.ALERTS);
    const savedHistory = localStorage.getItem(STORAGE_KEYS.SCRAPE_HISTORY);
    const savedViewed = localStorage.getItem(STORAGE_KEYS.RECENTLY_VIEWED);
    const savedNotifications = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);

    if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
    if (savedHistory) setScrapeHistory(JSON.parse(savedHistory));
    if (savedViewed) setRecentlyViewed(JSON.parse(savedViewed));
    if (savedNotifications) setNotifications(JSON.parse(savedNotifications));
    if (savedTheme) setTheme(savedTheme as "light" | "dark" | "system");
  }, []);

  // Save notifications
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    }
  }, [notifications]);

  const handleScrape = async () => {
    if (!confirm("Lancer une nouvelle collecte de données ?")) return;

    const startTime = Date.now();
    const historyItem: ScrapeHistoryItem = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      status: "pending",
      itemsFound: 0,
      duration: 0,
    };

    setScrapeHistory((prev) => [historyItem, ...prev.slice(0, 9)]);

    try {
      await scrape.mutateAsync();
      const duration = Date.now() - startTime;
      setScrapeHistory((prev) =>
        prev.map((item) =>
          item.id === historyItem.id
            ? { ...item, status: "success", itemsFound: stats?.total || 0, duration }
            : item
        )
      );
    } catch {
      const duration = Date.now() - startTime;
      setScrapeHistory((prev) =>
        prev.map((item) =>
          item.id === historyItem.id ? { ...item, status: "error", duration } : item
        )
      );
    }

    localStorage.setItem(STORAGE_KEYS.SCRAPE_HISTORY, JSON.stringify(scrapeHistory));
  };

  const handleSaveAlert = () => {
    const alert: SavedAlert = {
      id: editingAlert?.id || crypto.randomUUID(),
      name: newAlert.name,
      criteria: {
        minPrice: newAlert.minPrice ? Number(newAlert.minPrice) : undefined,
        maxPrice: newAlert.maxPrice ? Number(newAlert.maxPrice) : undefined,
        cities: newAlert.cities.length > 0 ? newAlert.cities : undefined,
        minDiscount: newAlert.minDiscount ? Number(newAlert.minDiscount) : undefined,
      },
      createdAt: editingAlert?.createdAt || new Date().toISOString(),
      enabled: true,
      matchCount: 0,
    };

    if (editingAlert) {
      setAlerts((prev) => prev.map((a) => (a.id === editingAlert.id ? alert : a)));
    } else {
      setAlerts((prev) => [...prev, alert]);
    }

    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    setShowAlertForm(false);
    setEditingAlert(null);
    setNewAlert({ name: "", minPrice: "", maxPrice: "", cities: [], minDiscount: "", notifyEmail: false, notifyPush: true });
  };

  const handleDeleteAlert = (id: string) => {
    if (!confirm("Supprimer cette alerte ?")) return;
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts.filter((a) => a.id !== id)));
  };

  const handleEditAlert = (alert: SavedAlert) => {
    setEditingAlert(alert);
    setNewAlert({
      name: alert.name,
      minPrice: alert.criteria.minPrice?.toString() || "",
      maxPrice: alert.criteria.maxPrice?.toString() || "",
      cities: alert.criteria.cities || [],
      minDiscount: alert.criteria.minDiscount?.toString() || "",
      notifyEmail: false,
      notifyPush: true,
    });
    setShowAlertForm(true);
  };

  const exportData = (format: "csv" | "json") => {
    const data = {
      alerts,
      scrapeHistory,
      recentlyViewed,
      notifications,
      exportedAt: new Date().toISOString(),
    };

    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `immo-agent-export-${new Date().toISOString().split("T")[0]}.json`;
      link.click();
    } else {
      const csv = [
        ["Type", "Données"],
        ["Alertes", alerts.length.toString()],
        ["Historique collectes", scrapeHistory.length.toString()],
        ["Biens consultés", recentlyViewed.length.toString()],
        ["Exporté le", new Date().toLocaleString(APP_CONFIG.locale)],
      ].map((row) => row.join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `immo-agent-export-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
    }
  };

  const clearRecentlyViewed = () => {
    if (!confirm("Effacer l'historique de navigation ?")) return;
    setRecentlyViewed([]);
    localStorage.removeItem(STORAGE_KEYS.RECENTLY_VIEWED);
  };

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  // Stats
  const usageStats = useMemo(() => ({
    alertsCount: alerts.length,
    viewedCount: recentlyViewed.length,
    lastScrape: scrapeHistory[0]?.timestamp,
    totalScrapes: scrapeHistory.length,
  }), [alerts, recentlyViewed, scrapeHistory]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
          <p className="text-gray-500">Configuration et données de l'application</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportData("json")}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Download size={18} />
            Exporter
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCardWithTrend
          title="Alertes actives"
          value={usageStats.alertsCount}
          icon={<Bell size={20} />}
        />
        <MetricCardWithTrend
          title="Biens consultés"
          value={usageStats.viewedCount}
          icon={<Eye size={20} />}
        />
        <MetricCardWithTrend
          title="Collectes"
          value={usageStats.totalScrapes}
          icon={<Database size={20} />}
        />
        <MetricCardWithTrend
          title="Données totales"
          value={stats?.total || 0}
          icon={<Zap size={20} />}
        />
      </div>

      {/* Alerts section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" id="alerts">
        <button
          onClick={() => toggleSection("alerts")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Alertes</h2>
            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
              {alerts.length}
            </span>
          </div>
          {expandedSection === "alerts" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "alerts" && (
          <div className="p-4 pt-0 space-y-4 animate-slide-in-from-bottom-2">
            {/* Add alert button */}
            <button
              onClick={() => setShowAlertForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus size={18} />
              Nouvelle alerte
            </button>

            {/* Alert form */}
            {showAlertForm && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-4 animate-scale-in">
                <h3 className="font-medium text-gray-900">
                  {editingAlert ? "Modifier l'alerte" : "Créer une alerte"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Nom de l'alerte</label>
                    <input
                      type="text"
                      value={newAlert.name}
                      onChange={(e) => setNewAlert((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Appartements Marseille"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Décote minimale (%)</label>
                    <input
                      type="number"
                      value={newAlert.minDiscount}
                      onChange={(e) => setNewAlert((prev) => ({ ...prev, minDiscount: e.target.value }))}
                      placeholder="Ex: 30"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Prix min (€)</label>
                    <input
                      type="number"
                      value={newAlert.minPrice}
                      onChange={(e) => setNewAlert((prev) => ({ ...prev, minPrice: e.target.value }))}
                      placeholder="Ex: 50000"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Prix max (€)</label>
                    <input
                      type="number"
                      value={newAlert.maxPrice}
                      onChange={(e) => setNewAlert((prev) => ({ ...prev, maxPrice: e.target.value }))}
                      placeholder="Ex: 200000"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSaveAlert}
                    disabled={!newAlert.name}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Check size={18} />
                    Sauvegarder
                  </button>
                  <button
                    onClick={() => {
                      setShowAlertForm(false);
                      setEditingAlert(null);
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Alerts list */}
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <BellOff size={32} className="mx-auto mb-2 opacity-50" />
                <p>Aucune alerte configurée</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium text-gray-900">{alert.name}</h4>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {alert.criteria.minDiscount && (
                          <span>Décote ≥ {alert.criteria.minDiscount}%</span>
                        )}
                        {alert.criteria.minPrice && (
                          <span>Prix ≥ {alert.criteria.minPrice.toLocaleString()} €</span>
                        )}
                        {alert.criteria.maxPrice && (
                          <span>Prix ≤ {alert.criteria.maxPrice.toLocaleString()} €</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditAlert(alert)}
                        className="p-2 text-gray-400 hover:text-primary-600 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scraping section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection("scraping")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <Database size={20} className="text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Collecte de données</h2>
          </div>
          {expandedSection === "scraping" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "scraping" && (
          <div className="p-4 pt-0 space-y-4 animate-slide-in-from-bottom-2">
            <div className="flex items-center gap-4">
              <button
                onClick={handleScrape}
                disabled={scrape.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                <RefreshCw size={18} className={scrape.isPending ? "animate-spin" : ""} />
                {scrape.isPending ? "Collecte en cours..." : "Lancer la collecte"}
              </button>
              {scrape.isSuccess && (
                <span className="flex items-center gap-1 text-sm text-green-600 animate-fade-in">
                  <Check size={16} />
                  Collecte terminée
                </span>
              )}
              {scrape.isError && (
                <span className="flex items-center gap-1 text-sm text-red-600 animate-fade-in">
                  <AlertTriangle size={16} />
                  Erreur
                </span>
              )}
            </div>

            {/* Scrape history */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Historique des collectes</h3>
              {scrapeHistory.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune collecte effectuée</p>
              ) : (
                <div className="space-y-2">
                  {scrapeHistory.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.status === "success"
                              ? "bg-green-500"
                              : item.status === "error"
                              ? "bg-red-500"
                              : "bg-yellow-500 animate-pulse"
                          }`}
                        />
                        <span className="text-gray-600">
                          {new Date(item.timestamp).toLocaleString(APP_CONFIG.locale)}
                        </span>
                      </div>
                      <div className="text-gray-500">
                        {item.status === "success" && `${item.itemsFound} biens • ${(item.duration / 1000).toFixed(1)}s`}
                        {item.status === "pending" && "En cours..."}
                        {item.status === "error" && "Échec"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Data sources */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Sources de données</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  Licitor (licitor.com)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  Enchères Publiques (encheres-publiques.com)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  DVF - Demandes de Valeurs Foncières
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Notifications section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection("notifications")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-yellow-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>
          {expandedSection === "notifications" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "notifications" && (
          <div className="p-4 pt-0 space-y-4 animate-slide-in-from-bottom-2">
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                <span className="text-gray-700">Nouvelles opportunités</span>
                <input
                  type="checkbox"
                  checked={notifications.newOpportunities}
                  onChange={(e) => setNotifications((prev) => ({ ...prev, newOpportunities: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                <span className="text-gray-700">Baisses de prix</span>
                <input
                  type="checkbox"
                  checked={notifications.priceDrops}
                  onChange={(e) => setNotifications((prev) => ({ ...prev, priceDrops: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
                <span className="text-gray-700">Enchères imminentes (48h)</span>
                <input
                  type="checkbox"
                  checked={notifications.upcomingAuctions}
                  onChange={(e) => setNotifications((prev) => ({ ...prev, upcomingAuctions: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* History section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection("history")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <History size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Historique de navigation</h2>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
              {recentlyViewed.length}
            </span>
          </div>
          {expandedSection === "history" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "history" && (
          <div className="p-4 pt-0 space-y-4 animate-slide-in-from-bottom-2">
            {recentlyViewed.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun bien consulté récemment</p>
            ) : (
              <>
                <button
                  onClick={clearRecentlyViewed}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Effacer l'historique
                </button>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {recentlyViewed.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                    >
                      <span className="text-gray-700 line-clamp-1">{item.address}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.viewedAt).toLocaleDateString(APP_CONFIG.locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Methodology section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection("methodology")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <BarChart3 size={20} className="text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Méthodologie d'analyse</h2>
          </div>
          {expandedSection === "methodology" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "methodology" && (
          <div className="p-4 pt-0 space-y-6 animate-slide-in-from-bottom-2">
            {/* Introduction */}
            <p className="text-sm text-gray-600">
              L'analyse compare le prix de mise aux enchères avec 3 sources de données pour estimer la décote réelle.
            </p>

            {/* Source 1: DVF */}
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <h3 className="font-semibold text-green-800">1. DVF - Transactions officielles</h3>
                <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Fiabilité haute</span>
              </div>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>Source:</strong> data.gouv.fr (données fiscales des notaires)</p>
                <p><strong>Méthode:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>Charge les transactions des 24 derniers mois</li>
                  <li>Filtre par code postal et type de bien</li>
                  <li>Calcule le prix médian au m²</li>
                  <li>Trouve les 10 transactions les plus proches en surface</li>
                </ul>
                <p className="mt-2 text-xs text-green-600">
                  ✓ Données réelles de ventes • ✓ Grande fiabilité • ✓ Historique complet
                </p>
              </div>
            </div>

            {/* Source 2: Commune */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                <h3 className="font-semibold text-blue-800">2. Indicateurs Commune</h3>
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">Fiabilité moyenne</span>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p><strong>Source:</strong> Statistiques agrégées par commune (data.gouv.fr)</p>
                <p><strong>Méthode:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>Prix moyen au m² par code postal</li>
                  <li>Données de l'année la plus récente</li>
                  <li>Historique sur 5 ans pour la tendance</li>
                </ul>
                <p className="mt-2 text-xs text-blue-600">
                  ✓ Vue macro du marché • ✓ Tendances long terme
                </p>
              </div>
            </div>

            {/* Source 3: Annonces */}
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                <h3 className="font-semibold text-orange-800">3. Annonces en ligne</h3>
                <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">Prix demandés</span>
              </div>
              <div className="text-sm text-orange-700 space-y-1">
                <p><strong>Sources:</strong> LeBonCoin, PAP.fr, Bien'ici</p>
                <p><strong>Méthode:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>Recherche biens similaires (même CP, type, surface ±30%)</li>
                  <li>Récupère 15-25 annonces par source</li>
                  <li>Calcule le prix médian au m²</li>
                  <li><strong>Applique -10% de décote</strong> (prix demandés {">"} prix vendus)</li>
                </ul>
                <p className="mt-2 text-xs text-orange-600">
                  ⚠ Prix demandés (non vendus) • ✓ Marché actuel • ✓ Comparables directs
                </p>
              </div>
            </div>

            {/* Calculation method */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">📊 Calcul de la recommandation</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p>Moyenne pondérée des 3 sources selon leur confiance:</p>
                <div className="bg-white rounded p-3 font-mono text-xs">
                  <div>DVF: confiance × 1.0 (données officielles)</div>
                  <div>Commune: confiance × 0.8 (agrégées)</div>
                  <div>Annonces: confiance × 0.9 (prix demandés)</div>
                  <div className="mt-2 border-t pt-2">
                    prix_recommandé = Σ(prix × poids) / Σ(poids)
                  </div>
                </div>
              </div>
            </div>

            {/* Discount calculation */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">💰 Calcul de la décote</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <div className="bg-white rounded p-3 font-mono text-xs">
                  <div>valeur_marché = prix_m² × surface</div>
                  <div>décote = (valeur_marché - mise_à_prix) / valeur_marché × 100</div>
                  <div>gain_potentiel = valeur_marché - mise_à_prix</div>
                </div>
                <p className="mt-2"><strong>Exemple:</strong> Appartement 83m² à 40 000€</p>
                <ul className="list-disc list-inside ml-2">
                  <li>Prix marché: 1 575 €/m² × 83 = 130 725€</li>
                  <li>Décote: (130 725 - 40 000) / 130 725 = <strong>69%</strong></li>
                  <li>Gain potentiel: <strong>90 725€</strong></li>
                </ul>
              </div>
            </div>

            {/* Reliability levels */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">🎯 Niveaux de fiabilité</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  <span><strong>Haute:</strong> 3 sources, accord ≥70%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                  <span><strong>Moyenne:</strong> 2+ sources</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                  <span><strong>Basse:</strong> 1 source</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                  <span><strong>Insuffisante:</strong> aucune donnée</span>
                </div>
              </div>
            </div>

            {/* Warnings */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Avertissements automatiques
              </h3>
              <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>Désaccord entre sources {"<"} 50% → Large fourchette de prix</li>
                <li>Données insuffisantes → Moins de 3 transactions DVF</li>
                <li>Annonces indisponibles → APIs temporairement bloquées</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* App info section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSection("info")}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Informations</h2>
          </div>
          {expandedSection === "info" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {expandedSection === "info" && (
          <div className="p-4 pt-0 animate-slide-in-from-bottom-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Application</p>
                <p className="font-medium">{APP_CONFIG.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Région</p>
                <p className="font-medium">{APP_CONFIG.region}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Départements</p>
                <p className="font-medium">{APP_CONFIG.departments.join(", ")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Tribunaux</p>
                <p className="font-medium">{APP_CONFIG.courts.length} tribunaux</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Villes couvertes</p>
                <p className="font-medium">{APP_CONFIG.cities.length} villes</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Centre carte</p>
                <p className="font-medium">
                  {APP_CONFIG.mapCenter.lat.toFixed(4)}, {APP_CONFIG.mapCenter.lng.toFixed(4)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
