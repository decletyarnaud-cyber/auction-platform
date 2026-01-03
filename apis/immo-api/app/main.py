import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import properties, health, enrichment, scraping, data_retention

app = FastAPI(
    title="Immo Auction API",
    description="API for French real estate judicial auctions with multi-source scraping and data enrichment",
    version="2.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["Health"])
app.include_router(properties.router, prefix="/api/properties", tags=["Properties"])
app.include_router(enrichment.router, prefix="/api/enrichment", tags=["Enrichment"])
app.include_router(scraping.router, prefix="/api/scraping", tags=["Scraping"])
app.include_router(data_retention.router, prefix="/api/data", tags=["Data Retention"])


@app.get("/debug")
async def debug():
    db_path = os.environ.get("DB_PATH", "/Users/ade/projects/web/auction-platform/data/auctions_unified.db")
    return {"db_path": db_path}


@app.get("/")
async def root():
    return {
        "message": "Immo Auction API",
        "version": "2.0.0",
        "features": [
            "Multi-source scraping (encheres-publiques, licitor, agorastore)",
            "Automatic data deduplication and merging",
            "Visit dates extraction",
            "Photo gallery extraction",
            "DVF market price enrichment",
            "Cadastre data integration",
            "INSEE socio-economic indicators",
            "POI accessibility analysis",
            "Document OCR analysis",
            "Automatic geocoding",
        ],
        "endpoints": {
            "properties": "/api/properties",
            "enrichment": "/api/enrichment",
            "scraping": "/api/scraping",
            "data": "/api/data",
        }
    }
