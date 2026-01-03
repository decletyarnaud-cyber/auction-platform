from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum
from datetime import datetime, date
import sqlite3
import os
import json

router = APIRouter()

# Global zones tendues cache
_zones_tendues_cache: dict = {}
_zones_tendues_loaded: bool = False


def load_zones_tendues():
    """Load zone tendue data from cache or API"""
    global _zones_tendues_cache, _zones_tendues_loaded

    if _zones_tendues_loaded:
        return _zones_tendues_cache

    import requests
    from pathlib import Path

    cache_file = Path("/Users/ade/projects/web/immo-marseille/data/zones_tendues_cache.json")

    # Try cache first
    if cache_file.exists():
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                _zones_tendues_cache = data.get('zones', {})
                _zones_tendues_loaded = True
                print(f"[ZonesTendues] Loaded {len(_zones_tendues_cache)} communes from cache")
                return _zones_tendues_cache
        except Exception as e:
            print(f"[ZonesTendues] Cache load error: {e}")

    # Fetch from API
    try:
        url = "https://gitlab.com/pidila/sp-simulateurs-data/-/raw/master/donnees-de-reference/TaxeLogementVacant.json"
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            zones = {}

            for commune in data.get('PlusDe50000', []):
                code = commune.get('codeInsee', '')
                if code:
                    zones[code] = {
                        'nom': commune.get('Nom', ''),
                        'tension': 'tres_tendue',
                        'niveau': 3,
                        'label': 'Très tendue (>50k déséquilibre)',
                    }

            for commune in data.get('DesequilibreOffreEtDemande', []):
                code = commune.get('codeInsee', '')
                if code and code not in zones:
                    zones[code] = {
                        'nom': commune.get('Nom', ''),
                        'tension': 'tendue',
                        'niveau': 2,
                        'label': 'Tendue (déséquilibre offre/demande)',
                    }

            _zones_tendues_cache = zones
            _zones_tendues_loaded = True
            print(f"[ZonesTendues] Loaded {len(zones)} communes from API")

            # Save to cache
            try:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, 'w', encoding='utf-8') as f:
                    json.dump({'zones': zones, 'cached_at': datetime.now().isoformat()}, f)
            except:
                pass

            return _zones_tendues_cache
    except Exception as e:
        print(f"[ZonesTendues] API error: {e}")

    _zones_tendues_loaded = True
    return {}


def get_db_path():
    """Get database path from environment, allowing dynamic updates"""
    return os.environ.get("DB_PATH", "/Users/ade/projects/web/auction-platform/data/auctions_unified.db")


class AuctionStatus(str, Enum):
    upcoming = "upcoming"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class PropertyType(str, Enum):
    apartment = "apartment"
    house = "house"
    commercial = "commercial"
    land = "land"
    parking = "parking"
    other = "other"


class OpportunityLevel(str, Enum):
    none = "none"
    good = "good"
    excellent = "excellent"
    exceptional = "exceptional"


class Document(BaseModel):
    type: str
    name: str
    url: str


class TensionLocative(BaseModel):
    tension: str
    niveau: int
    label: str
    nom: Optional[str] = None
    communes_tendues: Optional[int] = None


def get_tension_locative(postal_code: str) -> Optional[TensionLocative]:
    """Get rental tension data for a postal code"""
    zones = load_zones_tendues()

    if not postal_code or not zones:
        return None

    # Try exact postal code match (INSEE code often equals postal code for main cities)
    if postal_code in zones:
        z = zones[postal_code]
        return TensionLocative(
            tension=z['tension'],
            niveau=z['niveau'],
            label=z['label'],
            nom=z.get('nom'),
        )

    # Check department-level
    dept = postal_code[:2]
    dept_communes = [(k, v) for k, v in zones.items() if k.startswith(dept)]

    if dept_communes:
        return TensionLocative(
            tension='departement_tendu',
            niveau=1,
            label=f"Département avec zones tendues ({len(dept_communes)} communes)",
            communes_tendues=len(dept_communes),
        )

    return None


class PropertyAuction(BaseModel):
    id: str
    source: str
    sourceId: Optional[str] = None
    url: Optional[str] = None
    address: str
    postalCode: Optional[str] = None
    city: Optional[str] = None
    department: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    propertyType: PropertyType
    surface: Optional[float] = None
    rooms: Optional[int] = None
    description: str = ""
    descriptionDetailed: Optional[str] = None
    court: Optional[str] = None
    lawyerName: Optional[str] = None
    lawyerEmail: Optional[str] = None
    lawyerPhone: Optional[str] = None
    auctionDate: Optional[str] = None
    startingPrice: Optional[float] = None
    finalPrice: Optional[float] = None
    marketPrice: Optional[float] = None
    discountPercent: Optional[float] = None
    opportunityScore: Optional[float] = None
    opportunityLevel: OpportunityLevel = OpportunityLevel.none
    status: AuctionStatus = AuctionStatus.upcoming
    visitDates: List[str] = []
    photos: List[str] = []
    documents: List[Document] = []
    pvUrl: Optional[str] = None
    pricePerSqm: Optional[float] = None
    marketPricePerSqm: Optional[float] = None
    tensionLocative: Optional[TensionLocative] = None
    createdAt: str = ""
    updatedAt: str = ""
    firstSeenAt: Optional[str] = None
    isNew: bool = False  # True if first seen in last 48 hours


class PaginatedResponse(BaseModel):
    data: List[PropertyAuction]
    total: int
    page: int
    limit: int
    totalPages: int


class PropertyStats(BaseModel):
    total: int
    upcoming: int
    opportunities: int
    averageDiscount: float
    averagePricePerSqm: float


def get_db():
    """Get database connection"""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def map_property_type(type_bien: str) -> PropertyType:
    """Map French property types to enum"""
    mapping = {
        "appartement": PropertyType.apartment,
        "appartements": PropertyType.apartment,
        "maison": PropertyType.house,
        "maisons": PropertyType.house,
        "local commercial": PropertyType.commercial,
        "local_commercial": PropertyType.commercial,
        "locaux-commerciaux": PropertyType.commercial,
        "locaux commerciaux": PropertyType.commercial,
        "terrain": PropertyType.land,
        "terrains": PropertyType.land,
        "parking": PropertyType.parking,
        "parkings": PropertyType.parking,
        "box": PropertyType.parking,
        "cave": PropertyType.other,
        "immeuble": PropertyType.commercial,
        "immeubles": PropertyType.commercial,
        "autre": PropertyType.other,
        "autres": PropertyType.other,
    }
    return mapping.get((type_bien or "").lower().strip(), PropertyType.other)


def reverse_map_property_type(prop_type: PropertyType) -> List[str]:
    """Get all database values that map to a PropertyType enum"""
    reverse_mapping = {
        PropertyType.apartment: ["appartement", "appartements"],
        PropertyType.house: ["maison", "maisons"],
        PropertyType.commercial: ["local commercial", "local_commercial", "locaux-commerciaux", "locaux commerciaux", "immeuble", "immeubles"],
        PropertyType.land: ["terrain", "terrains"],
        PropertyType.parking: ["parking", "parkings", "box"],
        PropertyType.other: ["cave", "autre", "autres"],
    }
    return reverse_mapping.get(prop_type, [])


def calculate_opportunity_level(discount: float) -> OpportunityLevel:
    """Calculate opportunity level from discount percentage"""
    if discount >= 40:
        return OpportunityLevel.exceptional
    elif discount >= 30:
        return OpportunityLevel.excellent
    elif discount >= 20:
        return OpportunityLevel.good
    return OpportunityLevel.none


def parse_photos(photos_str: str) -> List[str]:
    """Parse photos from JSON string or comma-separated string"""
    if not photos_str:
        return []
    try:
        # Try JSON first
        photos = json.loads(photos_str)
        if isinstance(photos, list):
            return photos
        return []
    except (json.JSONDecodeError, TypeError):
        # Fallback to comma-separated
        return [p.strip() for p in photos_str.split(",") if p.strip()]


def parse_documents(documents_str: str) -> List[Document]:
    """Parse documents from JSON string"""
    if not documents_str:
        return []
    try:
        docs = json.loads(documents_str)
        if isinstance(docs, list):
            return [
                Document(
                    type=d.get("type", "document"),
                    name=d.get("name", d.get("type", "Document")),
                    url=d.get("url", "")
                )
                for d in docs if d.get("url")
            ]
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def row_to_property(row: sqlite3.Row) -> PropertyAuction:
    """Convert database row to PropertyAuction"""
    # Calculate discount if we have market price
    discount = None
    opportunity_level = OpportunityLevel.none
    if row["mise_a_prix"] and row["prix_marche_estime"] and row["prix_marche_estime"] > 0:
        discount = ((row["prix_marche_estime"] - row["mise_a_prix"]) / row["prix_marche_estime"]) * 100
        opportunity_level = calculate_opportunity_level(discount)

    # Calculate price per sqm
    price_sqm = None
    if row["mise_a_prix"] and row["surface"] and row["surface"] > 0:
        price_sqm = row["mise_a_prix"] / row["surface"]

    # Determine status based on date
    status = AuctionStatus.upcoming
    if row["date_vente"]:
        try:
            sale_date = datetime.strptime(str(row["date_vente"]), "%Y-%m-%d").date()
            if sale_date < date.today():
                status = AuctionStatus.completed
        except:
            pass

    # Parse visit dates
    visit_dates = []
    if row["dates_visite"]:
        visit_dates = [d.strip() for d in str(row["dates_visite"]).split(",") if d.strip()]

    # Parse photos and documents
    photos = parse_photos(row["photos"] if "photos" in row.keys() else None)
    documents = parse_documents(row["documents"] if "documents" in row.keys() else None)

    # Get detailed description
    description_detailed = None
    if "description_detaillee" in row.keys():
        description_detailed = row["description_detaillee"]

    import re

    # Clean description from prefixes like "EN LIGNE∙"
    description = row["description"] or ""
    if "∙" in description:
        description = description.split("∙", 1)[-1].strip()

    # Build a better title/address if missing
    address = row["adresse"] or ""
    if not address and description:
        # Use first part of description as title
        if len(description) > 100:
            address = description[:100] + "..."
        else:
            address = description
    if not address:
        # Fallback to type + city
        address = f"{row['type_bien'] or 'Bien'} - {row['ville'] or 'Localisation inconnue'}"

    # Clean "EN LIGNE∙" from address too
    if "∙" in address:
        address = address.split("∙", 1)[-1].strip()

    # Normalize city name
    city = row["ville"]
    if city:
        # Remove arrondissement number suffix and clean up
        city = city.strip()
        # Handle cases like "Marseille 14ème" -> "Marseille"
        city_clean = re.sub(r'\s+\d+(er|ème|e)?\s*$', '', city)
        if city_clean:
            city = city_clean

    # Try to extract city from address/description if missing
    if not city:
        # Pattern: "à CITY" or "à CITY (DEPARTMENT)"
        city_match = re.search(r'\bà\s+([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)*)', address + " " + description)
        if city_match:
            city = city_match.group(1).strip()
        # Also try postal code pattern
        if not city and row["code_postal"]:
            # Use postal code as fallback city indicator
            city = f"Code {row['code_postal']}"

    # Calculate if auction is new (first seen in last 48 hours)
    first_seen_at = None
    is_new = False
    try:
        # Try first_seen_at first, then created_at
        first_seen_str = row["first_seen_at"] if "first_seen_at" in row.keys() and row["first_seen_at"] else row["created_at"]
        if first_seen_str:
            first_seen_at = first_seen_str
            # Parse and check if within 48 hours
            from datetime import timedelta
            try:
                first_seen_dt = datetime.fromisoformat(first_seen_str.replace("Z", "+00:00").split("+")[0])
                is_new = (datetime.now() - first_seen_dt) < timedelta(hours=48)
            except:
                pass
    except:
        pass

    return PropertyAuction(
        id=str(row["id"]),
        source=row["source"] or "unknown",
        sourceId=row["source_id"],
        url=row["url"],
        address=address,
        postalCode=row["code_postal"],
        city=city,
        department=row["department"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        propertyType=map_property_type(row["type_bien"]),
        surface=row["surface"],
        rooms=row["nb_pieces"],
        description=description,
        descriptionDetailed=description_detailed,
        court=row["tribunal"],
        lawyerName=row["avocat_nom"],
        lawyerEmail=row["avocat_email"],
        lawyerPhone=row["avocat_telephone"],
        auctionDate=f"{row['date_vente']}T{row['heure_vente'] or '10:00'}:00" if row["date_vente"] else None,
        startingPrice=row["mise_a_prix"],
        finalPrice=row["prix_adjudication"],
        marketPrice=row["prix_marche_estime"],
        discountPercent=discount,
        opportunityLevel=opportunity_level,
        status=status,
        visitDates=visit_dates,
        photos=photos,
        documents=documents,
        pvUrl=row["pv_url"],
        pricePerSqm=price_sqm,
        marketPricePerSqm=row["prix_m2_marche"],
        tensionLocative=get_tension_locative(row["code_postal"]),
        createdAt=row["created_at"] or datetime.now().isoformat(),
        updatedAt=row["updated_at"] or datetime.now().isoformat(),
        firstSeenAt=first_seen_at,
        isNew=is_new,
    )


@router.get("", response_model=PaginatedResponse)
async def list_properties(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=500),
    search: Optional[str] = None,
    city: Optional[List[str]] = Query(None),
    department: Optional[List[str]] = Query(None),
    court: Optional[List[str]] = Query(None),
    propertyType: Optional[List[PropertyType]] = Query(None),
    status: Optional[List[AuctionStatus]] = Query(None),
    minPrice: Optional[float] = None,
    maxPrice: Optional[float] = None,
    minSurface: Optional[float] = None,
    maxSurface: Optional[float] = None,
    sortBy: str = "auctionDate",
    sortOrder: str = "asc",
):
    """List properties with filtering and pagination"""
    conn = get_db()

    # Build query
    query = "SELECT * FROM auctions WHERE 1=1"
    params = []

    if search:
        query += " AND (adresse LIKE ? OR ville LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    if city:
        placeholders = ",".join(["?" for _ in city])
        query += f" AND ville IN ({placeholders})"
        params.extend(city)
    if department:
        placeholders = ",".join(["?" for _ in department])
        query += f" AND department IN ({placeholders})"
        params.extend(department)
    if court:
        placeholders = ",".join(["?" for _ in court])
        query += f" AND tribunal IN ({placeholders})"
        params.extend(court)
    if propertyType:
        # Get all database values that map to the requested PropertyType enums
        db_types = []
        for pt in propertyType:
            db_types.extend(reverse_map_property_type(pt))
        if db_types:
            placeholders = ",".join(["?" for _ in db_types])
            query += f" AND LOWER(type_bien) IN ({placeholders})"
            params.extend([t.lower() for t in db_types])
    if minPrice is not None:
        query += " AND mise_a_prix >= ?"
        params.append(minPrice)
    if maxPrice is not None:
        query += " AND mise_a_prix <= ?"
        params.append(maxPrice)
    if minSurface is not None:
        query += " AND surface >= ?"
        params.append(minSurface)
    if maxSurface is not None:
        query += " AND surface <= ?"
        params.append(maxSurface)

    # Count total
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    total = conn.execute(count_query, params).fetchone()[0]

    # Sort
    sort_map = {
        "auctionDate": "date_vente",
        "startingPrice": "mise_a_prix",
        "discountPercent": "prix_marche_estime - mise_a_prix",
        "surface": "surface",
    }
    sort_col = sort_map.get(sortBy, "date_vente")
    query += f" ORDER BY {sort_col} {'DESC' if sortOrder == 'desc' else 'ASC'}"

    # Paginate
    offset = (page - 1) * limit
    query += f" LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = conn.execute(query, params).fetchall()
    conn.close()

    properties = [row_to_property(row) for row in rows]

    return PaginatedResponse(
        data=properties,
        total=total,
        page=page,
        limit=limit,
        totalPages=(total + limit - 1) // limit if total > 0 else 1,
    )


@router.get("/stats", response_model=PropertyStats)
async def get_stats(department: Optional[List[str]] = Query(None)):
    """Get property statistics, optionally filtered by department"""
    conn = get_db()

    # Build department filter
    dept_filter = ""
    dept_params = []
    if department:
        placeholders = ",".join(["?" for _ in department])
        dept_filter = f"AND department IN ({placeholders})"
        dept_params = list(department)

    total = conn.execute(
        f"SELECT COUNT(*) FROM auctions WHERE 1=1 {dept_filter}",
        dept_params
    ).fetchone()[0]

    upcoming = conn.execute(
        f"SELECT COUNT(*) FROM auctions WHERE date_vente >= date('now') {dept_filter}",
        dept_params
    ).fetchone()[0]

    # Opportunities: where discount > 20%
    opportunities = conn.execute(f"""
        SELECT COUNT(*) FROM auctions
        WHERE prix_marche_estime > 0
        AND ((prix_marche_estime - mise_a_prix) / prix_marche_estime) > 0.2
        {dept_filter}
    """, dept_params).fetchone()[0]

    # Average discount
    avg_discount_row = conn.execute(f"""
        SELECT AVG(((prix_marche_estime - mise_a_prix) / prix_marche_estime) * 100)
        FROM auctions
        WHERE prix_marche_estime > 0 AND mise_a_prix > 0
        {dept_filter}
    """, dept_params).fetchone()
    avg_discount = avg_discount_row[0] or 0

    # Average price per sqm
    avg_price_sqm_row = conn.execute(f"""
        SELECT AVG(mise_a_prix / surface)
        FROM auctions
        WHERE surface > 0 AND mise_a_prix > 0
        {dept_filter}
    """, dept_params).fetchone()
    avg_price_sqm = avg_price_sqm_row[0] or 0

    conn.close()

    return PropertyStats(
        total=total,
        upcoming=upcoming,
        opportunities=opportunities,
        averageDiscount=avg_discount,
        averagePricePerSqm=avg_price_sqm,
    )


@router.get("/upcoming", response_model=PaginatedResponse)
async def get_upcoming(
    limit: int = Query(10, ge=1, le=50),
    department: Optional[List[str]] = Query(None)
):
    """Get upcoming auctions, optionally filtered by department"""
    conn = get_db()

    # Build department filter
    dept_filter = ""
    dept_params = []
    if department:
        placeholders = ",".join(["?" for _ in department])
        dept_filter = f"AND department IN ({placeholders})"
        dept_params = list(department)

    rows = conn.execute(f"""
        SELECT * FROM auctions
        WHERE date_vente >= date('now')
        {dept_filter}
        ORDER BY date_vente ASC
        LIMIT ?
    """, dept_params + [limit]).fetchall()

    total = conn.execute(
        f"SELECT COUNT(*) FROM auctions WHERE date_vente >= date('now') {dept_filter}",
        dept_params
    ).fetchone()[0]
    conn.close()

    properties = [row_to_property(row) for row in rows]

    return PaginatedResponse(
        data=properties,
        total=total,
        page=1,
        limit=limit,
        totalPages=1,
    )


@router.get("/opportunities", response_model=PaginatedResponse)
async def get_opportunities(
    limit: int = Query(10, ge=1, le=50),
    department: Optional[List[str]] = Query(None)
):
    """Get best opportunities (highest discount), optionally filtered by department"""
    conn = get_db()

    # Build department filter
    dept_filter = ""
    dept_params = []
    if department:
        placeholders = ",".join(["?" for _ in department])
        dept_filter = f"AND department IN ({placeholders})"
        dept_params = list(department)

    rows = conn.execute(f"""
        SELECT *, ((prix_marche_estime - mise_a_prix) / prix_marche_estime) as discount
        FROM auctions
        WHERE prix_marche_estime > 0 AND mise_a_prix > 0
        AND date_vente >= date('now')
        {dept_filter}
        ORDER BY discount DESC
        LIMIT ?
    """, dept_params + [limit]).fetchall()

    total = conn.execute(f"""
        SELECT COUNT(*) FROM auctions
        WHERE prix_marche_estime > 0
        AND ((prix_marche_estime - mise_a_prix) / prix_marche_estime) > 0.2
        {dept_filter}
    """, dept_params).fetchone()[0]
    conn.close()

    properties = [row_to_property(row) for row in rows]

    return PaginatedResponse(
        data=properties,
        total=total,
        page=1,
        limit=limit,
        totalPages=1,
    )


@router.get("/incomplete", response_model=PaginatedResponse)
async def get_incomplete(limit: int = Query(100, ge=1, le=500)):
    """Get properties with incomplete data (missing price, city, or surface)"""
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM auctions
        WHERE date_vente >= date('now')
        AND (
            mise_a_prix IS NULL OR mise_a_prix = 0
            OR ville IS NULL OR ville = ''
            OR surface IS NULL OR surface = 0
            OR code_postal IS NULL OR code_postal = ''
        )
        ORDER BY date_vente ASC
        LIMIT ?
    """, [limit]).fetchall()

    total = conn.execute("""
        SELECT COUNT(*) FROM auctions
        WHERE date_vente >= date('now')
        AND (
            mise_a_prix IS NULL OR mise_a_prix = 0
            OR ville IS NULL OR ville = ''
            OR surface IS NULL OR surface = 0
            OR code_postal IS NULL OR code_postal = ''
        )
    """).fetchone()[0]
    conn.close()

    properties = [row_to_property(row) for row in rows]

    return PaginatedResponse(
        data=properties,
        total=total,
        page=1,
        limit=limit,
        totalPages=1,
    )


@router.get("/distant", response_model=PaginatedResponse)
async def get_distant(
    limit: int = Query(10, ge=1, le=50),
    department: Optional[List[str]] = Query(None)
):
    """Get most distant auctions (newest additions with later dates), optionally filtered by department"""
    conn = get_db()

    # Build department filter
    dept_filter = ""
    dept_params = []
    if department:
        placeholders = ",".join(["?" for _ in department])
        dept_filter = f"AND department IN ({placeholders})"
        dept_params = list(department)

    rows = conn.execute(f"""
        SELECT * FROM auctions
        WHERE date_vente >= date('now')
        {dept_filter}
        ORDER BY date_vente DESC, id DESC
        LIMIT ?
    """, dept_params + [limit]).fetchall()

    total = conn.execute(
        f"SELECT COUNT(*) FROM auctions WHERE date_vente >= date('now') {dept_filter}",
        dept_params
    ).fetchone()[0]
    conn.close()

    properties = [row_to_property(row) for row in rows]

    return PaginatedResponse(
        data=properties,
        total=total,
        page=1,
        limit=limit,
        totalPages=1,
    )


@router.get("/visits/calendar")
async def get_visits_calendar(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get calendar of property visits grouped by date."""
    from collections import defaultdict
    import re

    conn = get_db()
    rows = conn.execute("""
        SELECT id, ville, code_postal, adresse, mise_a_prix, dates_visite, date_vente, surface, type_bien
        FROM auctions
        WHERE dates_visite IS NOT NULL AND dates_visite != '' AND dates_visite != '[]'
    """).fetchall()
    conn.close()

    visits_by_date = defaultdict(list)

    for row in rows:
        visits_str = row["dates_visite"] or ""
        city = row["ville"] or row["code_postal"] or "?"

        # Parse visit dates (can be comma-separated or JSON array)
        visit_dates = []
        if visits_str:
            # Clean up the string
            cleaned = visits_str.replace('[', '').replace(']', '').replace('"', '').replace("'", "")
            # Split by comma
            for part in cleaned.split(','):
                part = part.strip()
                # Extract date (YYYY-MM-DD format)
                match = re.search(r'(\d{4}-\d{2}-\d{2})', part)
                if match:
                    visit_dates.append(match.group(1))

        for visit_date in visit_dates:
            # Filter by date range if provided
            if start_date and visit_date < start_date:
                continue
            if end_date and visit_date > end_date:
                continue

            visits_by_date[visit_date].append({
                "id": str(row["id"]),
                "city": city,
                "address": row["adresse"],
                "price": row["mise_a_prix"],
                "surface": row["surface"],
                "propertyType": row["type_bien"],
                "auctionDate": row["date_vente"],
            })

    # Convert to list sorted by date
    calendar = []
    for date in sorted(visits_by_date.keys()):
        calendar.append({
            "date": date,
            "count": len(visits_by_date[date]),
            "visits": visits_by_date[date]
        })

    return {
        "total": sum(len(day["visits"]) for day in calendar),
        "days": len(calendar),
        "calendar": calendar
    }


@router.get("/{property_id}", response_model=PropertyAuction)
async def get_property(property_id: str):
    """Get property by ID"""
    conn = get_db()
    row = conn.execute("SELECT * FROM auctions WHERE id = ?", [property_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    return row_to_property(row)


@router.get("/{property_id}/enriched")
async def get_property_enriched(property_id: str):
    """
    Get property with enrichment data from DVF, INSEE, and POI sources.

    Returns the property along with market analysis, socio-economic indicators,
    and accessibility scores.
    """
    import asyncio
    from ..services.dvf_enrichment import enrich_property_with_dvf
    from ..services.insee_enrichment import enrich_property_with_insee
    from ..services.poi_enrichment import enrich_property_with_pois

    conn = get_db()
    row = conn.execute("SELECT * FROM auctions WHERE id = ?", [property_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    property_data = row_to_property(row)

    # Prepare enrichment tasks
    enrichment_tasks = []

    # DVF enrichment
    if property_data.postalCode:
        enrichment_tasks.append(
            enrich_property_with_dvf(
                postal_code=property_data.postalCode,
                starting_price=property_data.startingPrice or 0,
                surface=property_data.surface,
                property_type=property_data.propertyType.value if property_data.propertyType else None,
            )
        )
    else:
        enrichment_tasks.append(asyncio.coroutine(lambda: None)())

    # INSEE enrichment
    if property_data.postalCode or property_data.city:
        enrichment_tasks.append(
            enrich_property_with_insee(
                postal_code=property_data.postalCode,
                city=property_data.city,
            )
        )
    else:
        enrichment_tasks.append(asyncio.coroutine(lambda: None)())

    # POI enrichment
    if property_data.latitude and property_data.longitude:
        enrichment_tasks.append(
            enrich_property_with_pois(
                latitude=property_data.latitude,
                longitude=property_data.longitude,
            )
        )
    else:
        enrichment_tasks.append(asyncio.coroutine(lambda: None)())

    # Run enrichments in parallel
    results = await asyncio.gather(*enrichment_tasks, return_exceptions=True)

    dvf_data = results[0] if not isinstance(results[0], Exception) else None
    insee_data = results[1] if not isinstance(results[1], Exception) else None
    poi_data = results[2] if not isinstance(results[2], Exception) else None

    return {
        "property": property_data.dict(),
        "enrichment": {
            "dvf": dvf_data,
            "insee": insee_data,
            "poi": poi_data,
        },
    }


@router.get("/{property_id}/multi-source-analysis")
async def get_multi_source_analysis(property_id: str):
    """
    Get comprehensive price analysis using multiple sources:
    1. DVF (official transaction data)
    2. Commune indicators (data.gouv.fr)
    3. Online listings (LeBonCoin, etc.)
    """
    from ..services.multi_source_analyzer import get_analyzer

    conn = get_db()
    row = conn.execute("SELECT * FROM auctions WHERE id = ?", [property_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    postal_code = row["code_postal"]
    city = row["ville"]
    property_type = row["type_bien"]
    surface = row["surface"]
    starting_price = row["mise_a_prix"]

    if not postal_code:
        return {"error": "Code postal manquant", "property_id": property_id}

    analyzer = get_analyzer()
    analysis = await analyzer.analyze(
        postal_code=postal_code,
        city=city or "",
        property_type=property_type or "appartement",
        surface=surface,
        starting_price=starting_price,
    )

    return analysis.to_dict()


@router.get("/{property_id}/similar-transactions")
async def get_similar_transactions(
    property_id: str,
    months_back: int = Query(24, ge=6, le=60),
    limit: int = Query(50, ge=10, le=100),
):
    """
    Get similar real estate transactions from DVF for comparison.
    Returns transactions in the same area to help analyze the market price.
    """
    from ..services.dvf_enrichment import get_dvf_service

    conn = get_db()
    row = conn.execute("SELECT * FROM auctions WHERE id = ?", [property_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    postal_code = row["code_postal"]
    property_type = row["type_bien"]
    surface = row["surface"]
    starting_price = row["mise_a_prix"]

    if not postal_code:
        return {
            "property_id": property_id,
            "transactions": [],
            "analysis": None,
            "error": "Code postal manquant pour cette annonce"
        }

    dvf_service = get_dvf_service()

    try:
        # Fetch transactions
        transactions = await dvf_service.get_transactions(
            postal_code=postal_code,
            property_type=property_type,
            months_back=months_back,
            limit=limit
        )

        # Get market analysis
        market_analysis = await dvf_service.get_market_price(
            postal_code=postal_code,
            property_type=property_type,
            surface=surface,
        )

        # Calculate discount if possible
        discount_analysis = None
        if market_analysis and starting_price and surface:
            discount_analysis = dvf_service.calculate_discount(
                starting_price=starting_price,
                market_analysis=market_analysis,
                surface=surface
            )

        # Format transactions for response
        formatted_transactions = [
            {
                "date": t.date,
                "price": t.price,
                "surface": t.surface,
                "pricePerSqm": round(t.price_per_sqm, 2) if t.price_per_sqm else None,
                "propertyType": t.property_type,
                "rooms": t.rooms,
                "address": t.address,
                "commune": t.commune,
                "latitude": t.latitude,
                "longitude": t.longitude,
            }
            for t in transactions
        ]

        return {
            "property_id": property_id,
            "postal_code": postal_code,
            "transactions": formatted_transactions,
            "analysis": {
                "median_price_per_sqm": market_analysis.median_price_per_sqm if market_analysis else None,
                "avg_price_per_sqm": market_analysis.avg_price_per_sqm if market_analysis else None,
                "min_price_per_sqm": market_analysis.min_price_per_sqm if market_analysis else None,
                "max_price_per_sqm": market_analysis.max_price_per_sqm if market_analysis else None,
                "transaction_count": market_analysis.transaction_count if market_analysis else 0,
                "confidence": market_analysis.confidence if market_analysis else "low",
            } if market_analysis else None,
            "discount_analysis": discount_analysis,
            "auction": {
                "starting_price": starting_price,
                "surface": surface,
                "price_per_sqm": round(starting_price / surface, 2) if starting_price and surface else None,
            }
        }

    except Exception as e:
        return {
            "property_id": property_id,
            "transactions": [],
            "analysis": None,
            "error": str(e)
        }


@router.post("/scrape/trigger")
async def trigger_scrape():
    """Trigger a scraping job for encheres-publiques.com"""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from ..scrapers.encheres_publiques import run_scraper

    # Get departments from environment or use defaults
    departments = os.environ.get("DEPARTMENTS", "75,77,78,91,92,93,94,95").split(",")

    # Run scraper in background thread to not block the API
    executor = ThreadPoolExecutor(max_workers=1)

    def scrape_task():
        try:
            result = run_scraper(get_db_path(), departments=departments, max_pages=20)
            return result
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # Start in background (non-blocking)
    future = executor.submit(scrape_task)

    return {
        "status": "started",
        "message": f"Scraping job started for departments: {', '.join(departments)}",
        "source": "encheres-publiques.com"
    }


class LawyerInfo(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    firm: Optional[str] = None
    address: Optional[str] = None


@router.get("/{property_id}/lawyer-info")
async def get_lawyer_info(property_id: int):
    """
    Fetch lawyer contact info from the source URL.
    Useful when the scraped data doesn't include lawyer email.
    """
    import httpx
    from bs4 import BeautifulSoup
    import re

    conn = get_db()
    row = conn.execute("SELECT url, avocat_nom, avocat_email, avocat_telephone FROM auctions WHERE id = ?", [property_id]).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    # If we already have the email in DB, return it
    if row["avocat_email"]:
        return LawyerInfo(
            name=row["avocat_nom"],
            email=row["avocat_email"],
            phone=row["avocat_telephone"],
        )

    url = row["url"]
    if not url:
        raise HTTPException(status_code=404, detail="No source URL for this property")

    # Fetch the page
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Failed to fetch source page: {resp.status_code}")

            soup = BeautifulSoup(resp.text, "html.parser")
            text = soup.get_text()

            # Extract lawyer info
            lawyer = LawyerInfo()

            # Email pattern
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
            if email_match:
                lawyer.email = email_match.group(0)

            # Phone pattern (French)
            phone_match = re.search(r'(?:0[1-9]|(?:\+33|0033)\s*[1-9])(?:[\s\.\-]*\d{2}){4}', text)
            if phone_match:
                phone = phone_match.group(0)
                phone = re.sub(r'[\s\.\-]', '', phone)
                if phone.startswith('+33'):
                    phone = '0' + phone[3:]
                elif phone.startswith('0033'):
                    phone = '0' + phone[4:]
                lawyer.phone = phone

            # Name pattern - Maître/Me
            name_match = re.search(r'(?:Ma[îi]tre|Me|M[eE]\.)\s+([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)', text)
            if name_match:
                lawyer.name = name_match.group(1)

            # Law firm pattern - AARPI/SCP/SELARL
            firm_match = re.search(r'(?:AARPI|SCP|SELARL)\s+([A-Za-zÀ-ü\s\-]+?)(?:,|\s+Avocat|$)', text)
            if firm_match:
                lawyer.firm = firm_match.group(1).strip()

            # Update DB if we found email
            if lawyer.email:
                conn = get_db()
                conn.execute("""
                    UPDATE auctions
                    SET avocat_email = ?, avocat_nom = COALESCE(avocat_nom, ?), avocat_telephone = COALESCE(avocat_telephone, ?)
                    WHERE id = ?
                """, [lawyer.email, lawyer.name, lawyer.phone, property_id])
                conn.commit()
                conn.close()

            return lawyer

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch source: {str(e)}")
