"""
Geocoder using French government API (api-adresse.data.gouv.fr)
"""
import sqlite3
import time
from typing import Optional, Tuple, Dict, Any
import httpx
from loguru import logger


def geocode_address(address: str, city: str = None, postal_code: str = None) -> Optional[Tuple[float, float]]:
    """Geocode an address using the French government API"""

    # Build search query - combine all parts for better accuracy
    parts = [address]
    if postal_code:
        parts.append(postal_code)
    if city:
        parts.append(city)
    query = " ".join(parts)

    try:
        response = httpx.get(
            "https://api-adresse.data.gouv.fr/search/",
            params={"q": query, "limit": 1},
            timeout=10.0
        )
        response.raise_for_status()
        data = response.json()

        if data.get("features"):
            coords = data["features"][0]["geometry"]["coordinates"]
            # API returns [longitude, latitude], we need (latitude, longitude)
            return (coords[1], coords[0])

        return None
    except Exception as e:
        logger.warning(f"Geocoding error for '{query}': {e}")
        return None


def geocode_all_properties(db_path: str) -> Dict[str, Any]:
    """Geocode all properties without coordinates"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Get properties without coordinates
    rows = conn.execute("""
        SELECT id, adresse, ville, code_postal
        FROM auctions
        WHERE latitude IS NULL OR longitude IS NULL
    """).fetchall()

    logger.info(f"Found {len(rows)} properties to geocode")

    success = 0
    failed = 0

    for row in rows:
        address = row["adresse"] or ""
        city = row["ville"] or ""
        postal_code = row["code_postal"] or ""

        # Skip if no address info
        if not address and not city:
            failed += 1
            continue

        coords = geocode_address(address, city, postal_code)

        if coords:
            lat, lng = coords
            conn.execute(
                "UPDATE auctions SET latitude = ?, longitude = ? WHERE id = ?",
                (lat, lng, row["id"])
            )
            conn.commit()
            success += 1
            logger.info(f"Geocoded {row['id']}: {city} -> ({lat:.4f}, {lng:.4f})")
        else:
            failed += 1
            logger.warning(f"Failed to geocode {row['id']}: {address}, {city}")

        # Rate limiting - be nice to the API
        time.sleep(0.2)

    conn.close()

    return {
        "status": "completed",
        "total": len(rows),
        "success": success,
        "failed": failed
    }


if __name__ == "__main__":
    import os
    db_path = os.environ.get("DB_PATH", "/Users/ade/projects/web/auction-platform/data/auctions_unified.db")
    result = geocode_all_properties(db_path)
    print(result)
