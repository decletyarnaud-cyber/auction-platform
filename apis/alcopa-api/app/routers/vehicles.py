from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum
from datetime import datetime

router = APIRouter()


class AuctionStatus(str, Enum):
    upcoming = "upcoming"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class FuelType(str, Enum):
    diesel = "diesel"
    petrol = "petrol"
    electric = "electric"
    hybrid = "hybrid"
    lpg = "lpg"
    other = "other"


class CTResult(str, Enum):
    favorable = "favorable"
    major = "major"
    critical = "critical"


class CTDefects(BaseModel):
    critical: int = 0
    major: int = 0
    minor: int = 0
    total: int = 0


class VehicleAuction(BaseModel):
    id: str
    source: str
    sourceId: str
    url: str
    brand: str
    model: str
    version: Optional[str] = None
    year: Optional[int] = None
    mileage: Optional[int] = None
    fuel: Optional[FuelType] = None
    transmission: Optional[str] = None
    color: Optional[str] = None
    ctDefects: Optional[CTDefects] = None
    ctResult: Optional[CTResult] = None
    ctDate: Optional[str] = None
    ctUrl: Optional[str] = None
    isProfessionalOnly: bool = False
    auctionDate: Optional[str] = None
    startingPrice: Optional[float] = None
    finalPrice: Optional[float] = None
    marketPrice: Optional[float] = None
    discountPercent: Optional[float] = None
    opportunityScore: Optional[float] = None
    status: AuctionStatus = AuctionStatus.upcoming
    photos: List[str] = []
    location: str = ""
    createdAt: str = ""
    updatedAt: str = ""


class PaginatedResponse(BaseModel):
    data: List[VehicleAuction]
    total: int
    page: int
    limit: int
    totalPages: int


class VehicleStats(BaseModel):
    total: int
    upcoming: int
    withCT: int
    averageDefects: float


# Mock data for development
MOCK_VEHICLES: List[VehicleAuction] = [
    VehicleAuction(
        id="1",
        source="alcopa",
        sourceId="ALC-001",
        url="https://alcopa-auction.fr/vehicle/1",
        brand="Peugeot",
        model="308",
        version="1.6 HDI Active",
        year=2019,
        mileage=85000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=1, minor=2, total=3),
        ctResult=CTResult.major,
        auctionDate="2025-01-02T09:00:00",
        startingPrice=8500,
        status=AuctionStatus.upcoming,
        location="marseille",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="2",
        source="alcopa",
        sourceId="ALC-002",
        url="https://alcopa-auction.fr/vehicle/2",
        brand="Renault",
        model="Clio",
        version="1.5 dCi Energy",
        year=2020,
        mileage=62000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=0, minor=1, total=1),
        ctResult=CTResult.favorable,
        auctionDate="2025-01-02T09:00:00",
        startingPrice=9200,
        status=AuctionStatus.upcoming,
        location="marseille",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="3",
        source="alcopa",
        sourceId="ALC-003",
        url="https://alcopa-auction.fr/vehicle/3",
        brand="Volkswagen",
        model="Golf",
        version="1.6 TDI",
        year=2018,
        mileage=95000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=0, minor=0, total=0),
        ctResult=CTResult.favorable,
        auctionDate="2025-01-02T09:00:00",
        startingPrice=11500,
        status=AuctionStatus.upcoming,
        location="marseille",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    # Budget vehicles < 5000€
    VehicleAuction(
        id="4",
        source="alcopa",
        sourceId="ALC-004",
        url="https://alcopa-auction.fr/vehicle/4",
        brand="Citroën",
        model="C3",
        version="1.4 HDI",
        year=2014,
        mileage=145000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=0, minor=2, total=2),
        ctResult=CTResult.favorable,
        auctionDate="2025-01-05T09:00:00",
        startingPrice=2800,
        status=AuctionStatus.upcoming,
        location="vitrolles",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="5",
        source="alcopa",
        sourceId="ALC-005",
        url="https://alcopa-auction.fr/vehicle/5",
        brand="Peugeot",
        model="207",
        version="1.6 HDI",
        year=2012,
        mileage=168000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=1, minor=3, total=4),
        ctResult=CTResult.major,
        auctionDate="2025-01-05T09:00:00",
        startingPrice=1900,
        status=AuctionStatus.upcoming,
        location="vitrolles",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="6",
        source="alcopa",
        sourceId="ALC-006",
        url="https://alcopa-auction.fr/vehicle/6",
        brand="Renault",
        model="Twingo",
        version="1.2",
        year=2015,
        mileage=78000,
        fuel=FuelType.petrol,
        ctDefects=CTDefects(critical=0, major=0, minor=0, total=0),
        ctResult=CTResult.favorable,
        auctionDate="2025-01-05T09:00:00",
        startingPrice=3500,
        status=AuctionStatus.upcoming,
        location="vitrolles",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="7",
        source="alcopa",
        sourceId="ALC-007",
        url="https://alcopa-auction.fr/vehicle/7",
        brand="Ford",
        model="Fiesta",
        version="1.4 TDCi",
        year=2013,
        mileage=125000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=0, minor=1, total=1),
        ctResult=CTResult.favorable,
        auctionDate="2025-01-08T09:00:00",
        startingPrice=2500,
        status=AuctionStatus.upcoming,
        location="vitrolles",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="8",
        source="alcopa",
        sourceId="ALC-008",
        url="https://alcopa-auction.fr/vehicle/8",
        brand="Volkswagen",
        model="Polo",
        version="1.2 TDI",
        year=2014,
        mileage=112000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=2, minor=1, total=3),
        ctResult=CTResult.major,
        auctionDate="2025-01-08T09:00:00",
        startingPrice=4200,
        status=AuctionStatus.upcoming,
        location="vitrolles",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
    VehicleAuction(
        id="9",
        source="alcopa",
        sourceId="ALC-009",
        url="https://alcopa-auction.fr/vehicle/9",
        brand="Dacia",
        model="Sandero",
        version="1.5 dCi",
        year=2016,
        mileage=95000,
        fuel=FuelType.diesel,
        ctDefects=CTDefects(critical=0, major=0, minor=1, total=1),
        ctResult=CTResult.favorable,
        auctionDate="2025-01-08T09:00:00",
        startingPrice=4800,
        status=AuctionStatus.upcoming,
        location="vitrolles",
        createdAt=datetime.now().isoformat(),
        updatedAt=datetime.now().isoformat(),
    ),
]


@router.get("", response_model=PaginatedResponse)
async def list_vehicles(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    search: Optional[str] = None,
    brand: Optional[List[str]] = Query(None),
    fuel: Optional[List[FuelType]] = Query(None),
    ctResult: Optional[List[CTResult]] = Query(None),
    minPrice: Optional[float] = None,
    maxPrice: Optional[float] = None,
    minYear: Optional[int] = None,
    maxYear: Optional[int] = None,
    minMileage: Optional[int] = None,
    maxMileage: Optional[int] = None,
    maxDefects: Optional[int] = None,
    sortBy: str = "auctionDate",
    sortOrder: str = "asc",
):
    """List vehicles with filtering and pagination"""
    filtered = MOCK_VEHICLES.copy()

    # Apply filters
    if search:
        search_lower = search.lower()
        filtered = [v for v in filtered if search_lower in v.brand.lower() or search_lower in v.model.lower()]
    if brand:
        filtered = [v for v in filtered if v.brand in brand]
    if fuel:
        filtered = [v for v in filtered if v.fuel in fuel]
    if ctResult:
        filtered = [v for v in filtered if v.ctResult in ctResult]
    if minPrice is not None:
        filtered = [v for v in filtered if v.startingPrice and v.startingPrice >= minPrice]
    if maxPrice is not None:
        filtered = [v for v in filtered if v.startingPrice and v.startingPrice <= maxPrice]
    if minYear is not None:
        filtered = [v for v in filtered if v.year and v.year >= minYear]
    if maxYear is not None:
        filtered = [v for v in filtered if v.year and v.year <= maxYear]
    if minMileage is not None:
        filtered = [v for v in filtered if v.mileage and v.mileage >= minMileage]
    if maxMileage is not None:
        filtered = [v for v in filtered if v.mileage and v.mileage <= maxMileage]
    if maxDefects is not None:
        filtered = [v for v in filtered if v.ctDefects and v.ctDefects.total <= maxDefects]

    # Sort
    reverse = sortOrder == "desc"
    if sortBy == "auctionDate":
        filtered.sort(key=lambda x: x.auctionDate or "", reverse=reverse)
    elif sortBy == "startingPrice":
        filtered.sort(key=lambda x: x.startingPrice or 0, reverse=reverse)
    elif sortBy == "ctDefects.total":
        filtered.sort(key=lambda x: x.ctDefects.total if x.ctDefects else 999, reverse=reverse)

    # Paginate
    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    paginated = filtered[start:end]

    return PaginatedResponse(
        data=paginated,
        total=total,
        page=page,
        limit=limit,
        totalPages=(total + limit - 1) // limit,
    )


@router.get("/stats", response_model=VehicleStats)
async def get_stats():
    """Get vehicle statistics"""
    upcoming = [v for v in MOCK_VEHICLES if v.status == AuctionStatus.upcoming]
    with_ct = [v for v in MOCK_VEHICLES if v.ctResult is not None]
    defects = [v.ctDefects.total for v in MOCK_VEHICLES if v.ctDefects]

    return VehicleStats(
        total=len(MOCK_VEHICLES),
        upcoming=len(upcoming),
        withCT=len(with_ct),
        averageDefects=sum(defects) / len(defects) if defects else 0,
    )


@router.get("/upcoming", response_model=PaginatedResponse)
async def get_upcoming(limit: int = Query(10, ge=1, le=50)):
    """Get upcoming auctions"""
    upcoming = [v for v in MOCK_VEHICLES if v.status == AuctionStatus.upcoming]
    upcoming.sort(key=lambda x: x.auctionDate or "")
    return PaginatedResponse(
        data=upcoming[:limit],
        total=len(upcoming),
        page=1,
        limit=limit,
        totalPages=1,
    )


@router.get("/brands")
async def get_brands():
    """Get all available brands"""
    brands = list(set(v.brand for v in MOCK_VEHICLES))
    brands.sort()
    return brands


@router.get("/{vehicle_id}", response_model=VehicleAuction)
async def get_vehicle(vehicle_id: str):
    """Get vehicle by ID"""
    for vehicle in MOCK_VEHICLES:
        if vehicle.id == vehicle_id:
            return vehicle
    raise HTTPException(status_code=404, detail="Vehicle not found")


@router.post("/scrape/trigger")
async def trigger_scrape():
    """Trigger a scraping job"""
    # In production, this would trigger the actual scraper
    return {"status": "started", "message": "Scraping job started"}
