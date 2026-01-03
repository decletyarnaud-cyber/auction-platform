"""
Mallorca Subastas API - FastAPI backend for Mallorca real estate auctions
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import properties

app = FastAPI(
    title="Mallorca Subastas API",
    description="API for Mallorca real estate auctions (BOE)",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(properties.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "mallorca-api"}
