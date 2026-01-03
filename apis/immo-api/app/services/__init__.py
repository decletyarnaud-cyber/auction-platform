"""
Data Enrichment Services

This module provides various enrichment services to enhance property data
with external data sources:
- DVF: Market prices from real estate transactions
- Cadastre: Parcel and building information
- INSEE: Socio-economic indicators
- POI: Points of Interest and accessibility analysis
- Document OCR: PDF document analysis
"""

from .dvf_enrichment import (
    DVFEnrichmentService,
    DVFTransaction,
    MarketAnalysis,
    get_dvf_service,
    enrich_property_with_dvf,
)

from .cadastre_enrichment import (
    CadastreEnrichmentService,
    ParcelInfo,
    CadastreAnalysis,
    get_cadastre_service,
    enrich_property_with_cadastre,
)

from .insee_enrichment import (
    INSEEEnrichmentService,
    SocioEconomicAnalysis,
    get_insee_service,
    enrich_property_with_insee,
)

from .poi_enrichment import (
    POIEnrichmentService,
    POIAnalysis,
    get_poi_service,
    enrich_property_with_pois,
)

from .document_ocr import (
    DocumentOCRService,
    DocumentAnalysis,
    get_ocr_service,
    analyze_auction_document,
)

__all__ = [
    # DVF
    "DVFEnrichmentService",
    "DVFTransaction",
    "MarketAnalysis",
    "get_dvf_service",
    "enrich_property_with_dvf",
    # Cadastre
    "CadastreEnrichmentService",
    "ParcelInfo",
    "CadastreAnalysis",
    "get_cadastre_service",
    "enrich_property_with_cadastre",
    # INSEE
    "INSEEEnrichmentService",
    "SocioEconomicAnalysis",
    "get_insee_service",
    "enrich_property_with_insee",
    # POI
    "POIEnrichmentService",
    "POIAnalysis",
    "get_poi_service",
    "enrich_property_with_pois",
    # Document OCR
    "DocumentOCRService",
    "DocumentAnalysis",
    "get_ocr_service",
    "analyze_auction_document",
]
