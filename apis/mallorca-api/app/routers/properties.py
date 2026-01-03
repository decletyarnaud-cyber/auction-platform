"""
Properties router for Mallorca API - maps Spanish schema to PropertyAuction format
"""
import os
import sqlite3
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

router = APIRouter()

DB_PATH = os.environ.get("DB_PATH", "/Users/ade/projects/web/mallorca-subastas/data/mallorca_subastas.db")


# Response models
class PropertyAuction(BaseModel):
    id: str
    source: str
    sourceId: Optional[str]
    url: Optional[str]
    address: Optional[str]
    postalCode: Optional[str]
    city: Optional[str]
    department: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    propertyType: Optional[str]
    surface: Optional[float]
    rooms: Optional[int]
    description: Optional[str]
    descriptionDetailed: Optional[str]
    court: Optional[str]
    lawyerName: Optional[str]
    lawyerEmail: Optional[str]
    lawyerPhone: Optional[str]
    auctionDate: Optional[str]
    startingPrice: Optional[float]
    finalPrice: Optional[float]
    marketPrice: Optional[float]
    discountPercent: Optional[float]
    opportunityScore: Optional[float]
    opportunityLevel: str = "none"
    status: str = "upcoming"
    visitDates: List[str] = []
    photos: List[str] = []
    documents: List[str] = []
    pvUrl: Optional[str]
    pricePerSqm: Optional[float]
    marketPricePerSqm: Optional[float]
    createdAt: Optional[str]
    updatedAt: Optional[str]


class PaginatedResponse(BaseModel):
    data: List[PropertyAuction]
    total: int
    page: int
    limit: int
    totalPages: int


class PropertyStats(BaseModel):
    total: int
    upcoming: int
    averageDiscount: Optional[float]
    totalValue: float


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def map_property_type(tipo_bien: Optional[str]) -> str:
    """Map Spanish property type to English"""
    if not tipo_bien:
        return "other"
    tipo_lower = tipo_bien.lower()
    if "piso" in tipo_lower or "apartamento" in tipo_lower or "vivienda" in tipo_lower:
        return "apartment"
    elif "casa" in tipo_lower or "chalet" in tipo_lower or "unifamiliar" in tipo_lower:
        return "house"
    elif "local" in tipo_lower or "comercial" in tipo_lower or "oficina" in tipo_lower:
        return "commercial"
    elif "terreno" in tipo_lower or "solar" in tipo_lower or "parcela" in tipo_lower:
        return "land"
    elif "garaje" in tipo_lower or "parking" in tipo_lower or "plaza" in tipo_lower:
        return "parking"
    return "other"


def calculate_opportunity_level(discount: Optional[float]) -> str:
    """Calculate opportunity level based on discount"""
    if not discount:
        return "none"
    if discount >= 50:
        return "exceptional"
    elif discount >= 30:
        return "excellent"
    elif discount >= 15:
        return "good"
    return "none"


def row_to_property(row: sqlite3.Row) -> PropertyAuction:
    """Convert a database row to PropertyAuction"""
    # Calculate discount
    valor_tasacion = row["valor_tasacion"]
    valor_subasta = row["valor_subasta"]
    discount = None
    if valor_tasacion and valor_subasta and valor_tasacion > 0:
        discount = ((valor_tasacion - valor_subasta) / valor_tasacion) * 100

    # Calculate price per sqm
    superficie = row["superficie"]
    price_per_sqm = None
    market_price_per_sqm = None
    if superficie and superficie > 0:
        if valor_subasta:
            price_per_sqm = valor_subasta / superficie
        if valor_tasacion:
            market_price_per_sqm = valor_tasacion / superficie

    # Determine status
    fecha_fin = row["fecha_fin"]
    estado = row["estado"]
    status = "upcoming"
    if estado:
        estado_lower = estado.lower()
        if "cerrada" in estado_lower or "finalizada" in estado_lower:
            status = "completed"
        elif "abierta" in estado_lower:
            status = "active"

    return PropertyAuction(
        id=str(row["id"]),
        source="BOE",
        sourceId=row["boe_id"],
        url=row["url"],
        address=row["direccion"],
        postalCode=row["codigo_postal"],
        city=row["municipio"],
        department=row["provincia"] or "Illes Balears",
        latitude=row["latitud"],
        longitude=row["longitud"],
        propertyType=map_property_type(row["tipo_bien"]),
        surface=row["superficie"],
        rooms=row["habitaciones"],
        description=row["descripcion"],
        descriptionDetailed=row["descripcion"],
        court=row["juzgado"],
        lawyerName=None,
        lawyerEmail=None,
        lawyerPhone=None,
        auctionDate=row["fecha_fin"],
        startingPrice=row["valor_subasta"],
        finalPrice=row["precio_adjudicacion"],
        marketPrice=row["valor_tasacion"],
        discountPercent=discount,
        opportunityScore=discount,
        opportunityLevel=calculate_opportunity_level(discount),
        status=status,
        visitDates=[],
        photos=[],
        documents=[],
        pvUrl=None,
        pricePerSqm=price_per_sqm,
        marketPricePerSqm=market_price_per_sqm,
        createdAt=row["fecha_publicacion"],
        updatedAt=row["fecha_publicacion"],
    )


@router.get("/properties", response_model=PaginatedResponse)
async def get_properties(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    sortBy: str = Query("auctionDate"),
    sortOrder: str = Query("asc"),
    search: Optional[str] = None,
    city: Optional[str] = None,
    propertyType: Optional[str] = None,
    status: Optional[str] = None,
    minPrice: Optional[float] = None,
    maxPrice: Optional[float] = None,
    minSurface: Optional[float] = None,
    maxSurface: Optional[float] = None,
):
    conn = get_db()

    # Build query
    where_clauses = []
    params = []

    if search:
        where_clauses.append("(direccion LIKE ? OR municipio LIKE ? OR descripcion LIKE ?)")
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param])

    if city:
        cities = city.split(",")
        placeholders = ",".join(["?" for _ in cities])
        where_clauses.append(f"municipio IN ({placeholders})")
        params.extend(cities)

    if minPrice is not None:
        where_clauses.append("valor_subasta >= ?")
        params.append(minPrice)

    if maxPrice is not None:
        where_clauses.append("valor_subasta <= ?")
        params.append(maxPrice)

    if minSurface is not None:
        where_clauses.append("superficie >= ?")
        params.append(minSurface)

    if maxSurface is not None:
        where_clauses.append("superficie <= ?")
        params.append(maxSurface)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    # Map sort fields
    sort_map = {
        "auctionDate": "fecha_fin",
        "startingPrice": "valor_subasta",
        "surface": "superficie",
        "discountPercent": "(valor_tasacion - valor_subasta) / valor_tasacion",
        "createdAt": "fecha_publicacion",
    }
    sort_field = sort_map.get(sortBy, "fecha_fin")
    sort_dir = "DESC" if sortOrder.lower() == "desc" else "ASC"

    # Get total count
    count_sql = f"SELECT COUNT(*) FROM subastas WHERE {where_sql}"
    total = conn.execute(count_sql, params).fetchone()[0]

    # Get paginated data
    offset = (page - 1) * limit
    data_sql = f"""
        SELECT * FROM subastas
        WHERE {where_sql}
        ORDER BY {sort_field} {sort_dir}
        LIMIT ? OFFSET ?
    """
    rows = conn.execute(data_sql, params + [limit, offset]).fetchall()
    conn.close()

    properties = [row_to_property(row) for row in rows]
    total_pages = (total + limit - 1) // limit

    return PaginatedResponse(
        data=properties,
        total=total,
        page=page,
        limit=limit,
        totalPages=total_pages,
    )


@router.get("/properties/stats", response_model=PropertyStats)
async def get_stats():
    conn = get_db()

    total = conn.execute("SELECT COUNT(*) FROM subastas").fetchone()[0]
    upcoming = conn.execute(
        "SELECT COUNT(*) FROM subastas WHERE estado = 'Abierta' OR fecha_fin > date('now')"
    ).fetchone()[0]

    # Average discount
    avg_discount = conn.execute("""
        SELECT AVG((valor_tasacion - valor_subasta) / valor_tasacion * 100)
        FROM subastas
        WHERE valor_tasacion > 0 AND valor_subasta > 0
    """).fetchone()[0]

    # Total value
    total_value = conn.execute(
        "SELECT COALESCE(SUM(valor_subasta), 0) FROM subastas"
    ).fetchone()[0]

    conn.close()

    return PropertyStats(
        total=total,
        upcoming=upcoming,
        averageDiscount=round(avg_discount, 1) if avg_discount else None,
        totalValue=total_value,
    )


@router.get("/properties/{property_id}", response_model=PropertyAuction)
async def get_property(property_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM subastas WHERE id = ?", (property_id,)).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    return row_to_property(row)
