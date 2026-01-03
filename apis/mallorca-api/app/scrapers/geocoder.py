"""
Geocoder for Spanish addresses using Nominatim (OpenStreetMap)
"""
import sqlite3
import time
from typing import Optional, Tuple, Dict, Any
import httpx
from loguru import logger


def geocode_address_nominatim(
    address: str,
    city: str = None,
    postal_code: str = None,
    country: str = "Spain"
) -> Optional[Tuple[float, float]]:
    """Geocode an address using Nominatim (OpenStreetMap)"""

    # Build search query
    parts = []
    if address and address.strip():
        parts.append(address.strip())
    if city and city.strip():
        parts.append(city.strip())
    if postal_code and postal_code.strip():
        parts.append(postal_code.strip())
    parts.append(country)

    query = ", ".join(parts)

    if len(query) < 5:
        return None

    try:
        response = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": query,
                "format": "json",
                "limit": 1,
                "countrycodes": "es",
            },
            headers={
                "User-Agent": "MallorcaSubastasApp/1.0"
            },
            timeout=10.0
        )
        response.raise_for_status()
        data = response.json()

        if data and len(data) > 0:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            return (lat, lon)

        # Try with just city if full address fails
        if city:
            response = httpx.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{city}, Mallorca, Spain",
                    "format": "json",
                    "limit": 1,
                },
                headers={
                    "User-Agent": "MallorcaSubastasApp/1.0"
                },
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()

            if data and len(data) > 0:
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                return (lat, lon)

        return None
    except Exception as e:
        logger.warning(f"Geocoding error for '{query}': {e}")
        return None


def geocode_by_cadastral_ref(ref_catastral: str) -> Optional[Tuple[float, float]]:
    """Try to get coordinates from Spanish cadastral reference"""
    if not ref_catastral:
        return None

    try:
        # Spanish cadastre API
        response = httpx.get(
            f"https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC",
            params={
                "Provincia": "",
                "Municipio": "",
                "SRS": "EPSG:4326",
                "RC": ref_catastral,
            },
            timeout=10.0
        )

        if response.status_code == 200:
            # Parse XML response (simplified)
            text = response.text
            if "<xcen>" in text and "<ycen>" in text:
                import re
                lon_match = re.search(r"<xcen>([0-9.-]+)</xcen>", text)
                lat_match = re.search(r"<ycen>([0-9.-]+)</ycen>", text)
                if lon_match and lat_match:
                    return (float(lat_match.group(1)), float(lon_match.group(1)))

        return None
    except Exception as e:
        logger.warning(f"Cadastral geocoding error for '{ref_catastral}': {e}")
        return None


def geocode_all_properties(db_path: str) -> Dict[str, Any]:
    """Geocode all Mallorca properties without coordinates"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Get properties without coordinates
    rows = conn.execute("""
        SELECT id, direccion, municipio, codigo_postal, referencia_catastral
        FROM subastas
        WHERE latitud IS NULL OR longitud IS NULL
    """).fetchall()

    logger.info(f"Found {len(rows)} properties to geocode")

    success = 0
    failed = 0

    for row in rows:
        address = row["direccion"] or ""
        city = row["municipio"] or ""
        postal_code = row["codigo_postal"] or ""
        ref_catastral = row["referencia_catastral"] or ""

        coords = None

        # Try cadastral reference first (most accurate)
        if ref_catastral:
            coords = geocode_by_cadastral_ref(ref_catastral)

        # Fall back to address geocoding
        if not coords:
            coords = geocode_address_nominatim(address, city, postal_code)

        if coords:
            lat, lng = coords
            conn.execute(
                "UPDATE subastas SET latitud = ?, longitud = ? WHERE id = ?",
                (lat, lng, row["id"])
            )
            conn.commit()
            success += 1
            logger.info(f"Geocoded {row['id']}: {city} -> ({lat:.4f}, {lng:.4f})")
        else:
            failed += 1
            logger.warning(f"Failed to geocode {row['id']}: {address}, {city}")

        # Rate limiting - Nominatim requires 1 req/sec max
        time.sleep(1.1)

    conn.close()

    return {
        "status": "completed",
        "total": len(rows),
        "success": success,
        "failed": failed
    }


if __name__ == "__main__":
    import os
    db_path = os.environ.get("DB_PATH", "/Users/ade/projects/web/mallorca-subastas/data/mallorca_subastas.db")
    result = geocode_all_properties(db_path)
    print(result)
