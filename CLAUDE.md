# CLAUDE.md - Auction Platform Monorepo

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Auction Platform is a monorepo containing 4 Next.js frontends for tracking auctions (real estate and vehicles) across France and Spain. It uses Turborepo for build orchestration, shared packages for code reuse, and FastAPI backends for data scraping.

## Architecture

```
auction-platform/
├── apps/                    # Next.js frontend applications
│   ├── immo-paris/         # Paris real estate auctions (port 3001)
│   ├── immo-marseille/     # Marseille real estate auctions (port 3002)
│   ├── mallorca/           # Mallorca real estate auctions (port 3003)
│   └── alcopa/             # Vehicle auctions (port 3004)
│
├── packages/               # Shared packages
│   ├── ui/                 # @repo/ui - React components
│   ├── types/              # @repo/types - TypeScript types
│   ├── api-client/         # @repo/api-client - React Query hooks
│   └── config/             # @repo/config - Tailwind/TS configs
│
├── apis/                   # FastAPI backends
│   ├── immo-api/           # API for immo-paris & immo-marseille
│   └── alcopa-api/         # API for alcopa
│
├── turbo.json              # Turborepo configuration
├── pnpm-workspace.yaml     # pnpm workspace config
└── package.json            # Root package.json
```

## Commands

```bash
# Install dependencies (from root)
pnpm install

# Development
pnpm dev                    # Start all apps
pnpm dev:immo-paris        # Start immo-paris only
pnpm dev:immo-marseille    # Start immo-marseille only
pnpm dev:mallorca          # Start mallorca only
pnpm dev:alcopa            # Start alcopa only

# Build
pnpm build                  # Build all apps
pnpm build --filter=immo-paris  # Build specific app

# Type checking
pnpm type-check            # Check all packages

# Lint
pnpm lint                  # Lint all packages

# API servers (from apis/ directories)
cd apis/immo-api && uvicorn app.main:app --reload --port 8000
cd apis/alcopa-api && uvicorn app.main:app --reload --port 8001
```

## Shared Packages

### @repo/ui

Shared React components using Tailwind CSS:

| Component | Description | Used By |
|-----------|-------------|---------|
| `AppShell` | Main layout with sidebar | All apps |
| `FilterPanel` | Collapsible filter container | All apps |
| `SelectFilter` | Dropdown filter | All apps |
| `RangeFilter` | Min/max range input | All apps |
| `SearchFilter` | Debounced search input | All apps |
| `PropertyCard` | Property auction card | immo-*, mallorca |
| `VehicleCard` | Vehicle auction card | alcopa |
| `MetricCard` | Dashboard KPI card | All apps |
| `OpportunityBadge` | Discount badge | immo-*, mallorca |
| `CTScoreBadge` | CT result badge | alcopa |
| `StatusBadge` | Auction status badge | All apps |
| `DataTable` | Sortable data table | All apps |
| `Pagination` | Page navigation | All apps |
| `TabNavigation` | Tab navigation | All apps |

### @repo/types

Shared TypeScript types:

- `BaseAuction` - Common auction fields
- `PropertyAuction` - Real estate auction
- `VehicleAuction` - Vehicle auction
- `AuctionStatus`, `PropertyType`, `FuelType`, `CTResult` - Enums
- `PaginatedResponse`, `AuctionFilters`, `PaginationParams` - API types

### @repo/api-client

React Query hooks for data fetching:

- `useProperties()`, `useProperty()` - Property data
- `useVehicles()`, `useVehicle()` - Vehicle data
- `usePropertyStats()`, `useVehicleStats()` - Statistics
- `useTriggerScrape()` - Trigger scraping
- `ApiProvider` - Query client provider

## App Configurations

Each app has its own config in `lib/config.ts`:

| App | Region | Locale | API Port |
|-----|--------|--------|----------|
| immo-paris | Paris & Île-de-France | fr-FR | 8000 |
| immo-marseille | Provence-Alpes-Côte d'Azur | fr-FR | 8000 |
| mallorca | Illes Balears | es-ES | 8000 |
| alcopa | Vitrolles (Marseille) | fr-FR | 8001 |

## Development

### Adding a new component

1. Create component in `packages/ui/components/`
2. Export from `packages/ui/index.ts`
3. Import in apps: `import { Component } from "@repo/ui"`

### Adding a new type

1. Add to relevant file in `packages/types/src/`
2. Export from `packages/types/src/index.ts`
3. Import in apps: `import type { Type } from "@repo/types"`

### Adding a new API hook

1. Create hook in `packages/api-client/src/hooks/`
2. Export from `packages/api-client/src/index.ts`
3. Import in apps: `import { useHook } from "@repo/api-client"`

## API Structure

Both APIs follow the same pattern:

```
/api/health           # Health check
/api/{entity}         # List with filters & pagination
/api/{entity}/stats   # Statistics
/api/{entity}/upcoming # Upcoming items
/api/{entity}/:id     # Single item
/api/{entity}/scrape/trigger # Trigger scrape
```

## Deployment

### Frontend (Vercel)
- Each app deploys separately
- Use rewrites to proxy API calls

### Backend (Railway)
- Each API deploys separately
- Environment variables for database

### Vercel rewrites example
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://immo-api.railway.app/api/:path*" }
  ]
}
```

## Language Notes

### French (immo-paris, immo-marseille, alcopa)
- enchères = auctions
- tribunal = court
- avocat = lawyer
- mise à prix = starting price
- contrôle technique (CT) = vehicle inspection
- défaut = defect

### Spanish (mallorca)
- subasta = auction
- juzgado = court
- valor tasación = appraisal value
- puja = bid

## Code Reuse Matrix

| Component | immo-paris | immo-marseille | mallorca | alcopa |
|-----------|:----------:|:--------------:|:--------:|:------:|
| AppShell | ✓ | ✓ | ✓ | ✓ |
| FilterPanel | ✓ | ✓ | ✓ | ✓ |
| PropertyCard | ✓ | ✓ | ✓ | - |
| VehicleCard | - | - | - | ✓ |
| OpportunityBadge | ✓ | ✓ | ✓ | - |
| CTScoreBadge | - | - | - | ✓ |
| MetricCard | ✓ | ✓ | ✓ | ✓ |
| DataTable | ✓ | ✓ | ✓ | - |

**Estimated code reuse: ~70%**
