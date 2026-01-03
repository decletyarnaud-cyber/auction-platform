from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import vehicles, health

app = FastAPI(
    title="Alcopa Vehicle Auction API",
    description="API for Alcopa vehicle auctions",
    version="1.0.0",
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
app.include_router(vehicles.router, prefix="/api/vehicles", tags=["Vehicles"])


@app.get("/")
async def root():
    return {"message": "Alcopa Vehicle Auction API", "version": "1.0.0"}
