#!/usr/bin/env python3
"""Export SQLite database to static JSON files for Vercel deployment.

This script transforms the auctions database into static JSON files that can be
served directly by Next.js without requiring a backend API.

Includes pre-computed price analysis from DVF and commune data.
"""

import csv
import json
import sqlite3
import sys
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Configuration
DB_PATH = Path(__file__).parent.parent / "data" / "auctions_unified.db"
DATA_DIR = Path("/Users/ade/projects/web/immo-marseille/data")
DVF_DIR = DATA_DIR / "dvf"
COMMUNE_FILE = DATA_DIR / "commune_indicators.json"
ZONES_TENDUES_FILE = DATA_DIR / "zones_tendues_cache.json"

# Region configurations
REGIONS = {
    "paris": {
        "departments": ["75", "77", "78", "91", "92", "93", "94", "95"],
        "output_dir": Path(__file__).parent.parent / "apps" / "immo-paris" / "public" / "data",
    },
    "marseille": {
        "departments": ["13", "83"],
        "output_dir": Path(__file__).parent.parent / "apps" / "immo-marseille" / "public" / "data",
    },
}

# ============================================================================
# PRICE ANALYSIS MODULE
# ============================================================================

class PriceAnalyzer:
    """Analyzes property prices using DVF and commune data."""

    def __init__(self):
        self._dvf_cache: Dict[str, List[Dict]] = {}
        self._commune_data: Dict = {}
        self._zones_tendues: Dict = {}
        self._load_commune_data()
        self._load_zones_tendues()

    def _load_commune_data(self):
        """Load commune indicators from cache."""
        if COMMUNE_FILE.exists():
            try:
                with open(COMMUNE_FILE, 'r', encoding='utf-8') as f:
                    self._commune_data = json.load(f)
                print(f"[Analyzer] Loaded {len(self._commune_data)} communes")
            except Exception as e:
                print(f"[Analyzer] Failed to load commune data: {e}")

    def _load_zones_tendues(self):
        """Load zones tendues data."""
        if ZONES_TENDUES_FILE.exists():
            try:
                with open(ZONES_TENDUES_FILE, 'r', encoding='utf-8') as f:
                    self._zones_tendues = json.load(f)
                print(f"[Analyzer] Loaded zones tendues data")
            except Exception as e:
                print(f"[Analyzer] Failed to load zones tendues: {e}")

    def _load_dvf_data(self, department: str) -> List[Dict]:
        """Load DVF data from CSV files for a department."""
        if department in self._dvf_cache:
            return self._dvf_cache[department]

        transactions = []
        for year in [2022, 2023, 2024]:
            file_path = DVF_DIR / f"dvf_{department}_{year}.csv"
            if not file_path.exists():
                continue

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        try:
                            price_str = row.get("valeur_fonciere", "").replace(",", ".")
                            if not price_str:
                                continue
                            price = float(price_str)
                            if price <= 0:
                                continue

                            surface_str = row.get("surface_reelle_bati", "").replace(",", ".")
                            surface = float(surface_str) if surface_str else None

                            if not surface or surface <= 0:
                                continue

                            price_per_sqm = price / surface
                            if price_per_sqm < 500 or price_per_sqm > 25000:
                                continue

                            numero = row.get("adresse_numero", "") or row.get("no_voie", "")
                            voie = row.get("adresse_nom_voie", "") or row.get("voie", "")
                            address = f"{numero} {voie}".strip()

                            transactions.append({
                                "date": row.get("date_mutation", ""),
                                "price": price,
                                "surface": surface,
                                "price_per_sqm": price_per_sqm,
                                "property_type": row.get("type_local", ""),
                                "postal_code": row.get("code_postal", ""),
                                "commune": row.get("nom_commune", ""),
                                "address": address,
                            })
                        except:
                            continue
            except Exception as e:
                print(f"[DVF] Error loading {file_path}: {e}")

        print(f"[DVF] Loaded {len(transactions)} transactions for dept {department}")
        self._dvf_cache[department] = transactions
        return transactions

    def get_dvf_analysis(
        self,
        postal_code: str,
        property_type: str,
        surface: Optional[float]
    ) -> Optional[Dict]:
        """Get DVF-based price analysis."""
        dept = postal_code[:2]
        all_transactions = self._load_dvf_data(dept)

        # Filter by postal code and property type
        date_limit = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")

        type_mapping = {
            "apartment": "Appartement",
            "appartement": "Appartement",
            "house": "Maison",
            "maison": "Maison",
        }
        dvf_type = type_mapping.get(property_type.lower(), None)

        filtered = []
        for tx in all_transactions:
            if tx.get("postal_code") != postal_code:
                continue
            if tx.get("date", "") < date_limit:
                continue
            if dvf_type and dvf_type.lower() not in tx.get("property_type", "").lower():
                continue
            if tx.get("price_per_sqm") and tx["price_per_sqm"] > 0:
                filtered.append(tx)

        if len(filtered) < 3:
            return None

        # Calculate statistics
        prices = sorted([tx["price_per_sqm"] for tx in filtered])
        n = len(prices)
        median = prices[n // 2]
        confidence = min(100, 30 + n * 2)

        # Find comparable transactions
        comparables = []
        if surface:
            similar = [tx for tx in filtered
                      if tx.get("surface") and abs(tx["surface"] - surface) / surface < 0.3]
            similar.sort(key=lambda x: abs(x["surface"] - surface))
            comparables = similar[:10]
        else:
            filtered.sort(key=lambda x: x.get("date", ""), reverse=True)
            comparables = filtered[:10]

        return {
            "source_name": "DVF (Transactions officielles)",
            "prix_m2": round(median, 0),
            "nb_data_points": n,
            "confidence": confidence,
            "notes": f"{n} transactions sur 24 mois",
            "comparables": [{
                "date": c.get("date"),
                "price": c.get("price"),
                "surface": c.get("surface"),
                "price_per_sqm": round(c.get("price_per_sqm", 0), 0),
                "address": c.get("address"),
            } for c in comparables],
        }

    def get_commune_analysis(self, postal_code: str) -> Optional[Dict]:
        """Get commune-based price analysis."""
        if not self._commune_data:
            return None

        commune_data = self._commune_data.get(postal_code)
        if not commune_data:
            return None

        years = commune_data.get("years", {})
        if not years:
            return None

        sorted_years = sorted(years.keys(), reverse=True)
        latest_year = sorted_years[0]
        latest_data = years[latest_year]

        prix_m2 = latest_data.get("prix_m2")
        if not prix_m2:
            return None

        nb_mutations = latest_data.get("nb_mutations", 0) or 0
        confidence = min(80, 20 + nb_mutations / 10)

        comparables = []
        for year, data in sorted(years.items(), reverse=True)[:5]:
            if data.get("prix_m2"):
                comparables.append({
                    "year": year,
                    "prix_m2": round(data["prix_m2"], 0),
                    "nb_mutations": data.get("nb_mutations"),
                })

        return {
            "source_name": "Indicateurs Commune",
            "prix_m2": round(prix_m2, 0),
            "nb_data_points": nb_mutations,
            "confidence": confidence,
            "notes": f"année {latest_year}",
            "comparables": comparables,
        }

    def get_tension_locative(self, postal_code: str) -> Optional[Dict]:
        """Get tension locative for postal code."""
        dept = postal_code[:2]
        dept_data = self._zones_tendues.get(dept)

        if not dept_data:
            return None

        communes_tendues = dept_data.get("nb_communes_tendues", 0)
        total_communes = dept_data.get("nb_communes_total", 1)
        ratio = communes_tendues / total_communes if total_communes > 0 else 0

        if ratio >= 0.5:
            niveau = 3
            label = "Zone très tendue"
        elif ratio >= 0.2:
            niveau = 2
            label = "Zone tendue"
        elif communes_tendues > 0:
            niveau = 1
            label = "Quelques communes tendues"
        else:
            niveau = 0
            label = "Zone non tendue"

        return {
            "niveau": niveau,
            "label": label,
            "communes_tendues": communes_tendues,
        }

    def analyze(
        self,
        postal_code: str,
        property_type: str,
        surface: Optional[float],
        starting_price: Optional[float]
    ) -> Optional[Dict]:
        """Perform full price analysis."""
        if not postal_code:
            return None

        dvf = self.get_dvf_analysis(postal_code, property_type, surface)
        commune = self.get_commune_analysis(postal_code)
        tension = self.get_tension_locative(postal_code)

        if not dvf and not commune:
            return None

        # Calculate combined recommendation
        estimates = []
        weights = []

        if dvf:
            estimates.append(dvf["prix_m2"])
            weights.append(dvf["confidence"])

        if commune:
            estimates.append(commune["prix_m2"])
            weights.append(commune["confidence"] * 0.8)

        if not estimates:
            return None

        total_weight = sum(weights)
        weighted_avg = sum(e * w for e, w in zip(estimates, weights)) / total_weight
        prix_m2_recommended = round(weighted_avg, 0)

        # Calculate discount and potential gain
        discount_percent = None
        potential_gain = None
        prix_total_estimated = None

        if surface and surface > 0:
            prix_total_estimated = round(weighted_avg * surface, 0)

            if starting_price and starting_price > 0:
                market_value = weighted_avg * surface
                discount_percent = round(
                    ((market_value - starting_price) / market_value) * 100, 1
                )
                potential_gain = round(market_value - starting_price, 0)

        # Determine reliability
        n_sources = len(estimates)
        avg_confidence = total_weight / n_sources

        if n_sources >= 2 and avg_confidence >= 60:
            reliability = "high"
        elif n_sources >= 1 and avg_confidence >= 40:
            reliability = "medium"
        else:
            reliability = "low"

        # Sources agreement
        if len(estimates) >= 2:
            avg = sum(estimates) / len(estimates)
            max_deviation = max(abs(e - avg) / avg for e in estimates)
            sources_agreement = round((1 - max_deviation) * 100, 0)
        else:
            sources_agreement = 50

        return {
            "sources": {
                "dvf": dvf,
                "commune": commune,
            },
            "tension_locative": tension,
            "combined": {
                "prix_m2_recommended": prix_m2_recommended,
                "prix_total_estimated": prix_total_estimated,
                "discount_percent": discount_percent,
                "potential_gain": potential_gain,
                "prix_m2_min": round(min(estimates), 0) if estimates else None,
                "prix_m2_max": round(max(estimates), 0) if estimates else None,
            },
            "reliability": reliability,
            "sources_agreement": sources_agreement,
            "analyzed_at": datetime.utcnow().isoformat() + "Z",
        }


# Global analyzer instance
_analyzer: Optional[PriceAnalyzer] = None


def get_analyzer() -> PriceAnalyzer:
    """Get or create the global analyzer instance."""
    global _analyzer
    if _analyzer is None:
        _analyzer = PriceAnalyzer()
    return _analyzer


# ============================================================================
# AUCTION EXPORT MODULE
# ============================================================================

# Property type mapping (French to enum)
PROPERTY_TYPE_MAP = {
    "appartement": "apartment",
    "maison": "house",
    "local commercial": "commercial",
    "terrain": "land",
    "parking": "parking",
    "box": "parking",
    "cave": "other",
    "immeuble": "commercial",
    None: "other",
    "": "other",
}


def json_serializer(obj: Any) -> Any:
    """Custom JSON serializer for dates and other types."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    components = name.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


def parse_json_field(value: Optional[str]) -> Optional[Union[list, dict]]:
    """Parse a JSON string field, returning empty list/dict on failure."""
    if not value:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


def parse_visit_dates(value: Optional[str]) -> List[str]:
    """Parse visit dates from various formats."""
    if not value:
        return []

    # Try JSON first
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(d) for d in parsed if d]
        return []
    except (json.JSONDecodeError, TypeError):
        pass

    # Try comma-separated
    if "," in value:
        return [d.strip() for d in value.split(",") if d.strip()]

    # Single date
    if value.strip():
        return [value.strip()]

    return []


def calculate_opportunity_level(discount: Optional[float]) -> str:
    """Calculate opportunity level based on discount percentage."""
    if discount is None or discount < 20:
        return "none"
    elif discount < 30:
        return "good"
    elif discount < 40:
        return "excellent"
    else:
        return "exceptional"


def determine_status(auction_date: Optional[str]) -> str:
    """Determine auction status based on date."""
    if not auction_date:
        return "upcoming"

    try:
        if isinstance(auction_date, str):
            auction_dt = datetime.fromisoformat(auction_date.replace("Z", "+00:00"))
        else:
            auction_dt = auction_date

        now = datetime.now()
        if auction_dt.date() > now.date():
            return "upcoming"
        elif auction_dt.date() == now.date():
            return "active"
        else:
            return "completed"
    except (ValueError, TypeError):
        return "upcoming"


def transform_auction(row: dict, include_analysis: bool = True) -> dict:
    """Transform a database row into PropertyAuction format."""
    # Parse JSON fields
    photos = parse_json_field(row.get("photos")) or []
    if isinstance(photos, str):
        photos = [photos] if photos else []

    visit_dates = parse_visit_dates(row.get("dates_visite"))

    # Map property type
    raw_type = (row.get("type_bien") or "").lower().strip()
    property_type = PROPERTY_TYPE_MAP.get(raw_type, "other")

    # Calculate derived fields
    discount = row.get("decote_pourcentage")
    opportunity_level = calculate_opportunity_level(discount)
    status = determine_status(row.get("date_vente"))

    # Calculate price per sqm
    surface = row.get("surface")
    starting_price = row.get("mise_a_prix")
    price_per_sqm = None
    if surface and surface > 0 and starting_price:
        price_per_sqm = round(starting_price / surface, 2)

    market_price_per_sqm = row.get("prix_m2_marche")

    # Pre-compute price analysis
    analysis = None
    if include_analysis:
        postal_code = row.get("code_postal")
        if postal_code:
            analyzer = get_analyzer()
            analysis = analyzer.analyze(
                postal_code=postal_code,
                property_type=property_type,
                surface=surface,
                starting_price=starting_price
            )

    # Build the PropertyAuction object
    return {
        # BaseAuction fields
        "id": str(row["id"]),
        "source": row.get("source", "unknown"),
        "sourceId": row.get("source_id") or str(row["id"]),
        "url": row.get("url") or "",
        "auctionDate": row.get("date_vente"),
        "startingPrice": row.get("mise_a_prix"),
        "finalPrice": row.get("prix_adjudication"),
        "marketPrice": row.get("prix_marche_estime"),
        "discountPercent": discount,
        "opportunityScore": row.get("score_opportunite"),
        "opportunityLevel": opportunity_level,
        "status": status,
        "createdAt": row.get("created_at") or datetime.now().isoformat(),
        "updatedAt": row.get("updated_at") or datetime.now().isoformat(),

        # PropertyAuction fields
        "address": row.get("adresse") or "",
        "postalCode": row.get("code_postal") or "",
        "city": row.get("ville") or "",
        "department": row.get("department") or "",
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
        "propertyType": property_type,
        "surface": surface,
        "rooms": row.get("nb_pieces"),
        "description": row.get("description") or "",
        "descriptionDetailed": row.get("description_detaillee"),
        "court": row.get("tribunal") or "",
        "lawyerName": row.get("avocat_nom"),
        "lawyerEmail": row.get("avocat_email"),
        "lawyerPhone": row.get("avocat_telephone"),
        "visitDates": visit_dates,
        "photos": photos if isinstance(photos, list) else [],
        "pvUrl": row.get("pv_url"),
        "pricePerSqm": price_per_sqm,
        "marketPricePerSqm": market_price_per_sqm,

        # Extra fields for display
        "auctionTime": row.get("heure_vente"),
        "firstSeenAt": row.get("first_seen_at"),

        # Pre-computed price analysis (for static mode)
        "analysis": analysis,
    }


def calculate_stats(auctions: List[Dict]) -> Dict:
    """Calculate statistics from auctions list."""
    now = datetime.now().date()

    upcoming = [a for a in auctions if a["status"] == "upcoming"]
    opportunities = [a for a in auctions if a["opportunityLevel"] in ("good", "excellent", "exceptional")]

    # Average discount (only for those with discount)
    discounts = [a["discountPercent"] for a in auctions if a["discountPercent"] and a["discountPercent"] > 0]
    avg_discount = round(sum(discounts) / len(discounts), 1) if discounts else 0

    # Average price per sqm
    prices_sqm = [a["pricePerSqm"] for a in auctions if a["pricePerSqm"] and a["pricePerSqm"] > 0]
    avg_price_sqm = round(sum(prices_sqm) / len(prices_sqm), 0) if prices_sqm else 0

    # By city
    by_city = {}
    for a in auctions:
        city = a["city"] or "Unknown"
        by_city[city] = by_city.get(city, 0) + 1

    # By property type
    by_type = {}
    for a in auctions:
        ptype = a["propertyType"]
        by_type[ptype] = by_type.get(ptype, 0) + 1

    return {
        "total": len(auctions),
        "upcoming": len(upcoming),
        "opportunities": len(opportunities),
        "averageDiscount": avg_discount,
        "averagePricePerSqm": avg_price_sqm,
        "byCity": by_city,
        "byPropertyType": by_type,
    }


def export_region(region_name: str, config: dict) -> None:
    """Export data for a specific region."""
    print(f"\n{'='*60}")
    print(f"Exporting {region_name.upper()}")
    print(f"{'='*60}")

    departments = config["departments"]
    output_dir = config["output_dir"]

    # Connect to database
    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Build query with placeholders
    placeholders = ",".join("?" * len(departments))
    query = f"""
        SELECT * FROM auctions
        WHERE department IN ({placeholders})
        ORDER BY date_vente ASC NULLS LAST
    """

    rows = conn.execute(query, departments).fetchall()
    conn.close()

    print(f"Found {len(rows)} auctions in departments {departments}")

    # Transform all rows
    auctions = [transform_auction(dict(row)) for row in rows]

    # Calculate stats
    stats = calculate_stats(auctions)

    # Prepare output
    output_dir.mkdir(parents=True, exist_ok=True)

    # Write auctions.json
    auctions_data = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "region": region_name,
        "departments": departments,
        "total": len(auctions),
        "auctions": auctions,
    }

    auctions_path = output_dir / "auctions.json"
    with open(auctions_path, "w", encoding="utf-8") as f:
        json.dump(auctions_data, f, ensure_ascii=False, indent=2, default=json_serializer)
    print(f"Wrote {auctions_path} ({len(auctions)} auctions)")

    # Write stats.json
    stats_data = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        **stats,
    }

    stats_path = output_dir / "stats.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats_data, f, ensure_ascii=False, indent=2)
    print(f"Wrote {stats_path}")

    # Write metadata.json
    metadata = {
        "lastUpdated": datetime.utcnow().isoformat() + "Z",
        "region": region_name,
        "departments": departments,
        "totalAuctions": len(auctions),
        "upcomingAuctions": stats["upcoming"],
    }

    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"Wrote {metadata_path}")

    # Summary
    print(f"\nStats for {region_name}:")
    print(f"  Total: {stats['total']}")
    print(f"  Upcoming: {stats['upcoming']}")
    print(f"  Opportunities: {stats['opportunities']}")
    print(f"  Avg discount: {stats['averageDiscount']}%")


def main():
    """Main entry point."""
    print("=" * 60)
    print("STATIC DATA EXPORT")
    print(f"Database: {DB_PATH}")
    print(f"Generated: {datetime.now().isoformat()}")
    print("=" * 60)

    # Get region from command line or export all
    if len(sys.argv) > 1:
        region = sys.argv[1].lower()
        if region in REGIONS:
            export_region(region, REGIONS[region])
        else:
            print(f"Unknown region: {region}")
            print(f"Available: {', '.join(REGIONS.keys())}")
            sys.exit(1)
    else:
        # Export all regions
        for region_name, config in REGIONS.items():
            export_region(region_name, config)

    print("\n" + "=" * 60)
    print("EXPORT COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
