#!/usr/bin/env python3
"""Export SQLite database to static JSON files for Vercel deployment.

This script transforms the auctions database into static JSON files that can be
served directly by Next.js without requiring a backend API.
"""

import json
import sqlite3
import sys
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

# Configuration
DB_PATH = Path(__file__).parent.parent / "data" / "auctions_unified.db"

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


def transform_auction(row: dict) -> dict:
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
