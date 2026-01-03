export enum AuctionStatus {
  UPCOMING = "upcoming",
  ACTIVE = "active",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum PropertyType {
  APARTMENT = "apartment",
  HOUSE = "house",
  COMMERCIAL = "commercial",
  LAND = "land",
  PARKING = "parking",
  OTHER = "other",
}

export enum FuelType {
  DIESEL = "diesel",
  PETROL = "petrol",
  ELECTRIC = "electric",
  HYBRID = "hybrid",
  LPG = "lpg",
  OTHER = "other",
}

export enum CTResult {
  FAVORABLE = "favorable",
  MAJOR = "major",
  CRITICAL = "critical",
}

export enum OpportunityLevel {
  NONE = "none",
  GOOD = "good",        // 20-30% below market
  EXCELLENT = "excellent", // 30-40% below market
  EXCEPTIONAL = "exceptional", // 40%+ below market
}
