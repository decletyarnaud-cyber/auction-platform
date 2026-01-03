"use client";

import { APP_CONFIG } from "@/lib/config";
import { useTriggerScrape } from "@repo/api-client";
import { Settings, RefreshCw, Car } from "lucide-react";

export default function SettingsPage() {
  const scrape = useTriggerScrape("/vehicles");

  const handleScrape = () => {
    if (confirm("Lancer une nouvelle collecte de données ?")) {
      scrape.mutate();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">Configuration de l'application</p>
      </div>

      {/* App info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Informations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Application</p>
            <p className="font-medium">{APP_CONFIG.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Site</p>
            <p className="font-medium">{APP_CONFIG.region}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Localisations</p>
            <p className="font-medium capitalize">{APP_CONFIG.locations.join(", ")}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Marques suivies</p>
            <p className="font-medium">{APP_CONFIG.brands.length} marques</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
        <div className="space-y-4">
          <button
            onClick={handleScrape}
            disabled={scrape.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              className={scrape.isPending ? "animate-spin" : ""}
            />
            {scrape.isPending ? "Collecte en cours..." : "Lancer la collecte"}
          </button>
          {scrape.isSuccess && (
            <p className="text-sm text-success-600">
              Collecte terminée avec succès !
            </p>
          )}
          {scrape.isError && (
            <p className="text-sm text-danger-600">
              Erreur lors de la collecte
            </p>
          )}
        </div>
      </div>

      {/* Data sources */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Sources de données
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-success-500 rounded-full" />
            Alcopa Auction (alcopa-auction.fr)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-success-500 rounded-full" />
            Contrôle Technique PDF
          </li>
        </ul>
      </div>
    </div>
  );
}
