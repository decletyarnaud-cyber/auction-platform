"""
Document OCR Analysis Service

This service extracts key information from auction documents (PV, cahier des charges)
using PDF text extraction and optional OCR for scanned documents.

Dependencies:
- pdfplumber: PDF text extraction
- pytesseract: OCR for images (optional)
- pdf2image: Convert PDF to images for OCR (optional)
"""

import re
import httpx
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from datetime import datetime
import asyncio
import tempfile
import os

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

try:
    import pytesseract
    from pdf2image import convert_from_path
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


@dataclass
class PropertyDetails:
    """Extracted property details from document."""
    type_bien: Optional[str]
    surface: Optional[float]
    nb_pieces: Optional[int]
    nb_chambres: Optional[int]
    etage: Optional[int]
    nb_etages: Optional[int]
    annee_construction: Optional[int]
    parking: Optional[bool]
    cave: Optional[bool]
    balcon: Optional[bool]
    terrasse: Optional[bool]
    ascenseur: Optional[bool]
    chauffage: Optional[str]
    dpe: Optional[str]


@dataclass
class LegalInfo:
    """Extracted legal information."""
    tribunal: Optional[str]
    numero_rg: Optional[str]  # Numero Rôle Général
    date_audience: Optional[str]
    avocat_poursuivant: Optional[str]
    avocat_email: Optional[str]
    avocat_phone: Optional[str]
    notaire: Optional[str]
    reference_cadastrale: Optional[str]


@dataclass
class FinancialInfo:
    """Extracted financial information."""
    mise_a_prix: Optional[float]
    frais_previsionnels: Optional[float]
    charges_copropriete: Optional[float]
    taxe_fonciere: Optional[float]
    loyer_actuel: Optional[float]
    occupation_status: Optional[str]  # "libre", "occupé", "indéterminé"


@dataclass
class VisitInfo:
    """Extracted visit information."""
    dates_visite: List[str]
    contact_visite: Optional[str]
    conditions_visite: Optional[str]


@dataclass
class DocumentAnalysis:
    """Complete document analysis result."""
    document_type: str  # "pv", "cahier_charges", "unknown"
    property_details: PropertyDetails
    legal_info: LegalInfo
    financial_info: FinancialInfo
    visit_info: VisitInfo
    extraction_confidence: float  # 0-1
    raw_text_preview: str  # First 500 chars
    analysis_date: str


class DocumentOCRService:
    """Service to extract and analyze auction documents."""

    # Regex patterns for extraction
    PATTERNS = {
        "mise_a_prix": [
            r"mise\s+[àa]\s+prix\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)\s*(?:€|euros?)?",
            r"prix\s+de\s+vente\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)\s*(?:€|euros?)?",
            r"montant\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)\s*(?:€|euros?)?",
        ],
        "surface": [
            r"surface\s+(?:habitable\s+)?[:\-]?\s*([\d,\.]+)\s*m[²2]",
            r"([\d,\.]+)\s*m[²2]\s+(?:environ\s+)?habitable",
            r"superficie\s*[:\-]?\s*([\d,\.]+)\s*m[²2]",
        ],
        "pieces": [
            r"(\d+)\s+pi[èe]ces?\s+principales?",
            r"T(\d+)",
            r"F(\d+)",
        ],
        "etage": [
            r"(\d+)(?:e|ème|er)?\s*[ée]tage",
            r"[ée]tage\s*[:\-]?\s*(\d+)",
            r"au\s+(\d+)(?:e|ème|er)?",
        ],
        "date_visite": [
            r"visite[s]?\s*[:\-]?\s*(?:le\s+)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
            r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:de\s+)?\d{1,2}h",
            r"(\d{1,2}\s+\w+\s+\d{4})",
        ],
        "tribunal": [
            r"tribunal\s+(?:judiciaire\s+)?(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)",
            r"TJ\s+(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+)",
        ],
        "numero_rg": [
            r"(?:RG|R\.G\.?|n°)\s*[:\-]?\s*(\d{2}[\/\-]\d+)",
            r"(\d{2}[\/\-]\d{4,5})",
        ],
        "dpe": [
            r"DPE\s*[:\-]?\s*([A-G])",
            r"classe\s+[ée]nerg[ée]tique\s*[:\-]?\s*([A-G])",
            r"diagnostic.*?([A-G])\s*kWh",
        ],
        "charges": [
            r"charges\s*(?:de\s+copropri[ée]t[ée])?\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)\s*(?:€|euros?)",
            r"provisions?\s+sur\s+charges\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)",
        ],
        "taxe_fonciere": [
            r"taxe\s+fonci[èe]re\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)\s*(?:€|euros?)",
            r"impôt\s+foncier\s*[:\-]?\s*([\d\s]+(?:[,\.]\d+)?)",
        ],
        "avocat": [
            r"Ma[îi]tre\s+([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)",
            r"avocat\s*[:\-]?\s*([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)",
        ],
        "email": [
            r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        ],
        "phone": [
            r"(?:t[ée]l\.?\s*[:\-]?\s*)?(0[1-9](?:[\s\.\-]?\d{2}){4})",
            r"(\+33[\s\.\-]?\d(?:[\s\.\-]?\d{2}){4})",
        ],
    }

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
        self._cache: Dict[str, DocumentAnalysis] = {}

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    def _parse_number(self, text: str) -> Optional[float]:
        """Parse a number from text, handling French formatting."""
        if not text:
            return None
        # Remove spaces
        text = text.replace(" ", "")
        # Replace comma with dot
        text = text.replace(",", ".")
        try:
            return float(text)
        except ValueError:
            return None

    def _search_patterns(
        self,
        text: str,
        patterns: List[str],
    ) -> Optional[str]:
        """Search for patterns in text, return first match."""
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                return match.group(1).strip()
        return None

    async def download_document(
        self,
        url: str,
    ) -> Optional[bytes]:
        """Download document from URL."""
        try:
            response = await self.client.get(url)
            response.raise_for_status()
            return response.content
        except Exception as e:
            print(f"Document download error: {e}")
            return None

    def extract_text_from_pdf(
        self,
        pdf_content: bytes,
    ) -> str:
        """Extract text from PDF using pdfplumber."""
        if not PDFPLUMBER_AVAILABLE:
            return ""

        text_parts = []

        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(pdf_content)
                temp_path = f.name

            with pdfplumber.open(temp_path) as pdf:
                for page in pdf.pages[:10]:  # Limit to first 10 pages
                    page_text = page.extract_text() or ""
                    text_parts.append(page_text)

            os.unlink(temp_path)

        except Exception as e:
            print(f"PDF extraction error: {e}")

        return "\n".join(text_parts)

    def extract_text_with_ocr(
        self,
        pdf_content: bytes,
    ) -> str:
        """Extract text from scanned PDF using OCR."""
        if not OCR_AVAILABLE:
            return ""

        text_parts = []

        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(pdf_content)
                temp_path = f.name

            # Convert PDF to images
            images = convert_from_path(temp_path, first_page=1, last_page=5)

            for img in images:
                text = pytesseract.image_to_string(img, lang="fra")
                text_parts.append(text)

            os.unlink(temp_path)

        except Exception as e:
            print(f"OCR extraction error: {e}")

        return "\n".join(text_parts)

    def extract_property_details(
        self,
        text: str,
    ) -> PropertyDetails:
        """Extract property details from text."""
        # Surface
        surface_str = self._search_patterns(text, self.PATTERNS["surface"])
        surface = self._parse_number(surface_str) if surface_str else None

        # Pieces
        pieces_str = self._search_patterns(text, self.PATTERNS["pieces"])
        pieces = int(pieces_str) if pieces_str and pieces_str.isdigit() else None

        # Etage
        etage_str = self._search_patterns(text, self.PATTERNS["etage"])
        etage = int(etage_str) if etage_str and etage_str.isdigit() else None

        # DPE
        dpe = self._search_patterns(text, self.PATTERNS["dpe"])

        # Type de bien
        type_bien = None
        text_lower = text.lower()
        if "appartement" in text_lower:
            type_bien = "appartement"
        elif "maison" in text_lower:
            type_bien = "maison"
        elif "terrain" in text_lower:
            type_bien = "terrain"
        elif "local" in text_lower and "commercial" in text_lower:
            type_bien = "local commercial"

        # Features detection
        parking = "parking" in text_lower or "garage" in text_lower
        cave = "cave" in text_lower
        balcon = "balcon" in text_lower
        terrasse = "terrasse" in text_lower
        ascenseur = "ascenseur" in text_lower

        # Chauffage
        chauffage = None
        if "chauffage" in text_lower:
            if "gaz" in text_lower:
                chauffage = "gaz"
            elif "électrique" in text_lower:
                chauffage = "électrique"
            elif "fioul" in text_lower:
                chauffage = "fioul"
            elif "collectif" in text_lower:
                chauffage = "collectif"

        return PropertyDetails(
            type_bien=type_bien,
            surface=surface,
            nb_pieces=pieces,
            nb_chambres=None,  # Would need more specific pattern
            etage=etage,
            nb_etages=None,
            annee_construction=None,
            parking=parking,
            cave=cave,
            balcon=balcon,
            terrasse=terrasse,
            ascenseur=ascenseur,
            chauffage=chauffage,
            dpe=dpe,
        )

    def extract_legal_info(
        self,
        text: str,
    ) -> LegalInfo:
        """Extract legal information from text."""
        tribunal = self._search_patterns(text, self.PATTERNS["tribunal"])
        numero_rg = self._search_patterns(text, self.PATTERNS["numero_rg"])
        avocat = self._search_patterns(text, self.PATTERNS["avocat"])
        email = self._search_patterns(text, self.PATTERNS["email"])
        phone = self._search_patterns(text, self.PATTERNS["phone"])

        return LegalInfo(
            tribunal=tribunal,
            numero_rg=numero_rg,
            date_audience=None,
            avocat_poursuivant=avocat,
            avocat_email=email,
            avocat_phone=phone,
            notaire=None,
            reference_cadastrale=None,
        )

    def extract_financial_info(
        self,
        text: str,
    ) -> FinancialInfo:
        """Extract financial information from text."""
        # Mise à prix
        prix_str = self._search_patterns(text, self.PATTERNS["mise_a_prix"])
        mise_a_prix = self._parse_number(prix_str) if prix_str else None

        # Charges
        charges_str = self._search_patterns(text, self.PATTERNS["charges"])
        charges = self._parse_number(charges_str) if charges_str else None

        # Taxe foncière
        taxe_str = self._search_patterns(text, self.PATTERNS["taxe_fonciere"])
        taxe = self._parse_number(taxe_str) if taxe_str else None

        # Occupation status
        text_lower = text.lower()
        occupation = None
        if "libre" in text_lower and "occupation" in text_lower:
            occupation = "libre"
        elif "occupé" in text_lower:
            occupation = "occupé"

        return FinancialInfo(
            mise_a_prix=mise_a_prix,
            frais_previsionnels=None,
            charges_copropriete=charges,
            taxe_fonciere=taxe,
            loyer_actuel=None,
            occupation_status=occupation,
        )

    def extract_visit_info(
        self,
        text: str,
    ) -> VisitInfo:
        """Extract visit information from text."""
        # Find all visit dates
        dates = []
        for pattern in self.PATTERNS["date_visite"]:
            matches = re.findall(pattern, text, re.IGNORECASE)
            dates.extend(matches)

        return VisitInfo(
            dates_visite=list(set(dates)),
            contact_visite=None,
            conditions_visite=None,
        )

    def determine_document_type(
        self,
        text: str,
    ) -> str:
        """Determine the type of document."""
        text_lower = text.lower()

        if "procès-verbal" in text_lower or "proces-verbal" in text_lower:
            return "pv"
        elif "cahier des charges" in text_lower:
            return "cahier_charges"
        elif "adjudication" in text_lower or "enchères" in text_lower:
            return "pv"

        return "unknown"

    def calculate_confidence(
        self,
        property_details: PropertyDetails,
        legal_info: LegalInfo,
        financial_info: FinancialInfo,
    ) -> float:
        """Calculate extraction confidence score."""
        score = 0.0
        total_fields = 0

        # Property details
        if property_details.surface:
            score += 1
            total_fields += 1
        if property_details.nb_pieces:
            score += 1
            total_fields += 1
        if property_details.type_bien:
            score += 1
            total_fields += 1

        # Legal info
        if legal_info.tribunal:
            score += 1
            total_fields += 1
        if legal_info.numero_rg:
            score += 1
            total_fields += 1

        # Financial info
        if financial_info.mise_a_prix:
            score += 2  # More important
            total_fields += 2

        if total_fields == 0:
            return 0.0

        return score / total_fields

    async def analyze_document(
        self,
        url: Optional[str] = None,
        content: Optional[bytes] = None,
    ) -> Optional[DocumentAnalysis]:
        """
        Analyze an auction document.

        Args:
            url: URL to the PDF document
            content: PDF content as bytes (alternative to URL)

        Returns:
            DocumentAnalysis or None
        """
        # Check cache
        cache_key = url or "direct_content"
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Get content
        if content is None and url:
            content = await self.download_document(url)

        if not content:
            return None

        # Extract text
        text = self.extract_text_from_pdf(content)

        # If no text extracted, try OCR
        if not text.strip() and OCR_AVAILABLE:
            text = self.extract_text_with_ocr(content)

        if not text.strip():
            return None

        # Extract information
        property_details = self.extract_property_details(text)
        legal_info = self.extract_legal_info(text)
        financial_info = self.extract_financial_info(text)
        visit_info = self.extract_visit_info(text)

        # Calculate confidence
        confidence = self.calculate_confidence(
            property_details,
            legal_info,
            financial_info,
        )

        # Determine document type
        doc_type = self.determine_document_type(text)

        analysis = DocumentAnalysis(
            document_type=doc_type,
            property_details=property_details,
            legal_info=legal_info,
            financial_info=financial_info,
            visit_info=visit_info,
            extraction_confidence=confidence,
            raw_text_preview=text[:500],
            analysis_date=datetime.now().isoformat(),
        )

        self._cache[cache_key] = analysis
        return analysis


# Singleton instance
_ocr_service: Optional[DocumentOCRService] = None


def get_ocr_service() -> DocumentOCRService:
    """Get or create the OCR service singleton."""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = DocumentOCRService()
    return _ocr_service


async def analyze_auction_document(
    url: Optional[str] = None,
    content: Optional[bytes] = None,
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to analyze an auction document.

    Returns:
        Analysis data dict or None
    """
    service = get_ocr_service()

    analysis = await service.analyze_document(url=url, content=content)

    if not analysis:
        return None

    result = {
        "document_type": analysis.document_type,
        "extraction_confidence": round(analysis.extraction_confidence, 2),
        "property": {},
        "legal": {},
        "financial": {},
        "visits": [],
    }

    # Property details
    pd = analysis.property_details
    if pd.type_bien:
        result["property"]["type"] = pd.type_bien
    if pd.surface:
        result["property"]["surface"] = pd.surface
    if pd.nb_pieces:
        result["property"]["rooms"] = pd.nb_pieces
    if pd.etage is not None:
        result["property"]["floor"] = pd.etage
    if pd.dpe:
        result["property"]["dpe"] = pd.dpe

    # Features
    features = []
    if pd.parking:
        features.append("parking")
    if pd.cave:
        features.append("cave")
    if pd.balcon:
        features.append("balcon")
    if pd.terrasse:
        features.append("terrasse")
    if pd.ascenseur:
        features.append("ascenseur")
    if features:
        result["property"]["features"] = features

    if pd.chauffage:
        result["property"]["heating"] = pd.chauffage

    # Legal info
    li = analysis.legal_info
    if li.tribunal:
        result["legal"]["court"] = li.tribunal
    if li.numero_rg:
        result["legal"]["case_number"] = li.numero_rg
    if li.avocat_poursuivant:
        result["legal"]["lawyer"] = li.avocat_poursuivant
    if li.avocat_email:
        result["legal"]["lawyer_email"] = li.avocat_email
    if li.avocat_phone:
        result["legal"]["lawyer_phone"] = li.avocat_phone

    # Financial info
    fi = analysis.financial_info
    if fi.mise_a_prix:
        result["financial"]["starting_price"] = fi.mise_a_prix
    if fi.charges_copropriete:
        result["financial"]["charges"] = fi.charges_copropriete
    if fi.taxe_fonciere:
        result["financial"]["property_tax"] = fi.taxe_fonciere
    if fi.occupation_status:
        result["financial"]["occupation"] = fi.occupation_status

    # Visit info
    result["visits"] = analysis.visit_info.dates_visite

    return result
