"""
Seed the dev database with a complete demo flow.

Creates 7 demo clients, each with meeting-minute checkpoints, a selected
design, and a quotation whose line items are imported from the real workbook
("Ravi Kumar SKy Park Quotation.xlsx" at the repo root).

Shared catalog (materials + margins) is created once.

Idempotent: skips any client that already exists by name.
Pass --reset to delete the demo clients and re-create them.
Pass --business "<name>" to seed into one business (clients, materials and
--reset are then confined to that business via row-level security); without
it, demo data is created with no business (visible to the superadmin only).

Run from the repo root:
    DATABASE_URL=... python -m backend.seed_demo [--reset] [--business NAME]
"""

import argparse
import logging
import sys
from pathlib import Path

from sqlalchemy import delete, func

from .core.database import SessionLocal, scope_session
from .models.business import Business
from .models.checkpoint import Checkpoint, CheckpointSource, CheckpointStatus
from .models.client import Client, ProjectPhase
from .models.design import Design, DesignSource
from .models.margin import MarginConfig
from .models.material import MaterialRate
from .models.quotation import Quotation, QuotationStatus
from .models.quotation_line_item import QuotationLineItem
from .models.user import User, UserRole
from .services.quotation_importer import parse_workbook

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_demo")

WORKBOOK_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "Ravi Kumar SKy Park Quotation.xlsx"
)

DEMO_CLIENTS: list[dict] = [
    {
        "name": "Mohan Reddy",
        "contact_info": {
            "phone": "+91 97654 30021",
            "email": "mohan.reddy@example.com",
            "address": "Prestige Lakeside, Flat 803, Whitefield, Bengaluru",
        },
        "current_phase": ProjectPhase.quotation,
        "notes": "3BHK full interiors. Warm-wood laminate preferred, budget firm at 19 lakh.",
        "design_title": "3BHK Prestige Lakeside — Warm Wood Modern",
        "design_description": (
            "Warm-wood laminate carpentry throughout, L-shape modular kitchen "
            "with granite counter, POP ceiling with cove lighting."
        ),
    },
    {
        "name": "Ravi Kumar",
        "contact_info": {
            "phone": "+91 98765 43210",
            "email": "ravi.kumar@example.com",
            "address": "Sky Park Residences, Flat 1204, Hebbal, Bengaluru",
        },
        "current_phase": ProjectPhase.design,
        "notes": "4BHK premium interiors. Acrylic shutters in kitchen, budget 28 lakh.",
        "design_title": "4BHK Sky Park — Contemporary Acrylic",
        "design_description": (
            "Contemporary style with acrylic kitchen shutters, hydraulic wardrobes, "
            "and stretch ceiling in living room."
        ),
    },
    {
        "name": "Priya Sharma",
        "contact_info": {
            "phone": "+91 91234 56789",
            "email": "priya.sharma@example.com",
            "address": "Brigade Metropolis, Flat 502, Mahadevapura, Bengaluru",
        },
        "current_phase": ProjectPhase.implementation,
        "notes": "2BHK compact interiors. Scandinavian minimal style, budget 12 lakh.",
        "design_title": "2BHK Brigade Metropolis — Scandinavian Minimal",
        "design_description": (
            "Light oak veneer, open shelving, minimal hardware, "
            "white Kemper kitchen with quartz countertop."
        ),
    },
    {
        "name": "Ankit Jain",
        "contact_info": {
            "phone": "+91 88001 22334",
            "email": "ankit.jain@example.com",
            "address": "Sobha Dream Acres, Flat 3A, Panathur, Bengaluru",
        },
        "current_phase": ProjectPhase.quotation,
        "notes": "3BHK mid-range. Dark wood laminate, budget 16 lakh.",
        "design_title": "3BHK Sobha Dream Acres — Dark Wood Classic",
        "design_description": (
            "Dark walnut laminate carpentry, straight modular kitchen, "
            "gypsum false ceiling with recessed lighting."
        ),
    },
    {
        "name": "Sunita Rao",
        "contact_info": {
            "phone": "+91 77899 11223",
            "email": "sunita.rao@example.com",
            "address": "Embassy Springs, Villa 14, Devanahalli, Bengaluru",
        },
        "current_phase": ProjectPhase.design,
        "notes": "Independent villa, full interiors, luxury segment. Budget 45 lakh.",
        "design_title": "Villa Embassy Springs — Luxury Transitional",
        "design_description": (
            "Transitional style with stone cladding, custom veneer joinery, "
            "Italian finish kitchen, and coffered ceiling in living."
        ),
    },
    {
        "name": "Deepak Menon",
        "contact_info": {
            "phone": "+91 99887 65432",
            "email": "deepak.menon@example.com",
            "address": "Godrej Reflections, Flat 702, Kanakapura Road, Bengaluru",
        },
        "current_phase": ProjectPhase.quotation,
        "notes": "3BHK interiors + pooja room. Budget 20 lakh, prefers warm tones.",
        "design_title": "3BHK Godrej Reflections — Warm Contemporary",
        "design_description": (
            "Warm beige palette, teak veneer accents, island kitchen, "
            "decorative jali panel in living room."
        ),
    },
    {
        "name": "Kavitha Nair",
        "contact_info": {
            "phone": "+91 80011 44556",
            "email": "kavitha.nair@example.com",
            "address": "Purva Panorama, Flat 901, JP Nagar, Bengaluru",
        },
        "current_phase": ProjectPhase.design,
        "notes": "2.5BHK. Client wants maximalist design, bold colors. Budget 15 lakh.",
        "design_title": "2.5BHK Purva Panorama — Bold Maximalist",
        "design_description": (
            "Statement wall panels, high-gloss colored shutters in kitchen, "
            "fluted glass partitions, and patterned tile feature walls."
        ),
    },
]

MATERIALS: list[dict] = [
    {
        "name": "Laminate Plywood 19mm",
        "category": "carpentry",
        "unit": "sqft",
        "unit_cost": 1350,
    },
    {
        "name": "Back Panel Laminate",
        "category": "carpentry",
        "unit": "sqft",
        "unit_cost": 350,
    },
    {
        "name": "Overhead Loft Unit",
        "category": "carpentry",
        "unit": "sqft",
        "unit_cost": 1050,
    },
    {
        "name": "Kitchen Carcass BWP",
        "category": "modular_kitchen",
        "unit": "sqft",
        "unit_cost": 1650,
    },
    {
        "name": "Granite Counter Top",
        "category": "modular_kitchen",
        "unit": "nos",
        "unit_cost": 9500,
    },
    {
        "name": "POP False Ceiling",
        "category": "ceiling",
        "unit": "sqft",
        "unit_cost": 90,
    },
    {
        "name": "Emulsion Paint Premium",
        "category": "painting",
        "unit": "sqft",
        "unit_cost": 32,
    },
    {
        "name": "Profile LED Lighting",
        "category": "electrical",
        "unit": "rft",
        "unit_cost": 450,
    },
]

MARGINS: list[dict] = [
    {"category": None, "margin_percent": 15},
    {"category": "carpentry", "margin_percent": 20},
    {"category": "modular_kitchen", "margin_percent": 18},
]

DESIGN_SPECS: dict = {
    "materials": [
        {
            "name": "Laminate Plywood 19mm",
            "category": "carpentry",
            "qty": 220,
            "unit": "sqft",
        },
        {
            "name": "Back Panel Laminate",
            "category": "carpentry",
            "qty": 340,
            "unit": "sqft",
        },
        {
            "name": "Kitchen Carcass BWP",
            "category": "modular_kitchen",
            "qty": 120,
            "unit": "sqft",
        },
        {
            "name": "Granite Counter Top",
            "category": "modular_kitchen",
            "qty": 5,
            "unit": "nos",
        },
        {
            "name": "POP False Ceiling",
            "category": "ceiling",
            "qty": 1400,
            "unit": "sqft",
        },
        {
            "name": "Emulsion Paint Premium",
            "category": "painting",
            "qty": 3200,
            "unit": "sqft",
        },
    ],
    "labor_estimate": 185000,
}

CHECKPOINTS: list[dict] = [
    {
        # Kickoff — no line items yet, just scoping notes
        "summary_text": (
            "Kickoff meeting for 3BHK at Prestige Lakeside, Whitefield.\n"
            "Full interiors agreed: living room, modular kitchen, master bedroom, "
            "guest bedroom, kids bedroom, pooja unit, balcony and utility.\n"
            "Client prefers warm-wood laminate over acrylic throughout.\n"
            "False ceiling with cove lighting in living and master bedroom.\n"
            "Budget target: 18–22 lakh excluding loose furniture and curtains.\n"
            "Site handover expected in 2 weeks; design freeze by end of month."
        ),
        "structured_diff": {
            "meeting_minutes": [
                "Kickoff meeting for 3BHK at Prestige Lakeside, Whitefield",
                "Full interiors: living room, modular kitchen, master bedroom, guest bedroom, kids bedroom, pooja unit, balcony, utility",
                "Client prefers warm-wood laminate over acrylic throughout",
                "False ceiling with cove lighting in living and master bedroom",
                "Budget target 18–22 lakh excluding loose furniture and curtains",
                "Site handover expected in 2 weeks; design freeze by end of month",
            ],
            "line_items": [],
        },
        "status": CheckpointStatus.draft,
        "source": CheckpointSource.manual,
        "added_to_quotation": False,
    },
    {
        # First AI-extracted checkpoint — scoped line items from site visit notes
        "summary_text": (
            "Site visit + scope finalisation call with Mohan.\n"
            "Living room TV unit confirmed: 8×2 ft, back-lit panel, laminate finish.\n"
            "Modular kitchen L-shape layout, BWP carcass, granite counter, chimney included.\n"
            "Master bedroom: full-height wardrobe 7×8 ft with mirror shutter, study nook.\n"
            "Kids bedroom: loft bed with storage, study table 4 ft, wardrobe 5×7 ft.\n"
            "Guest bedroom: wardrobe 5×7 ft, no extra carpentry.\n"
            "POP false ceiling in living room and master bedroom only.\n"
            "Electrical: 3 fan points, 6 light points per room, profile LED in living.\n"
            "Client approved laminate grade: Merino 1mm throughout."
        ),
        "structured_diff": {
            "meeting_minutes": [
                "Site visit + scope finalisation call with Mohan",
                "Living room TV unit: 8×2 ft, back-lit panel, laminate finish",
                "Modular kitchen L-shape layout, BWP carcass, granite counter, chimney included",
                "Master bedroom: full-height wardrobe 7×8 ft with mirror shutter, study nook",
                "Kids bedroom: loft bed with storage, study table 4 ft, wardrobe 5×7 ft",
                "Guest bedroom: wardrobe 5×7 ft only",
                "POP false ceiling in living room and master bedroom only",
                "Profile LED cove lighting in living room",
                "Client approved Merino 1mm laminate throughout",
            ],
            "line_items": [
                {
                    "room": "Living Room",
                    "description": "TV Unit with back-lit panel and laminate finish",
                    "unit": "sqft",
                    "raw_dimension": "8'x2'",
                    "qty": None,
                    "rate": 1200,
                    "remarks": "Merino 1mm laminate, LED back panel",
                },
                {
                    "room": "Living Room",
                    "description": "POP False Ceiling with cove lighting",
                    "unit": "sqft",
                    "raw_dimension": None,
                    "qty": 180,
                    "rate": 90,
                    "remarks": "Profile LED strip included",
                },
                {
                    "room": "Kitchen",
                    "description": "Modular Kitchen — L-shape BWP carcass with laminates",
                    "unit": "sqft",
                    "raw_dimension": None,
                    "qty": 48,
                    "rate": 1650,
                    "remarks": "Includes upper and lower shutters",
                },
                {
                    "room": "Kitchen",
                    "description": "Granite Counter Top",
                    "unit": "nos",
                    "raw_dimension": None,
                    "qty": 1,
                    "rate": 9500,
                    "remarks": "Black galaxy granite, 20mm thickness",
                },
                {
                    "room": "Master Bedroom",
                    "description": "Full-height wardrobe with mirror shutter",
                    "unit": "sqft",
                    "raw_dimension": "7'x8'",
                    "qty": None,
                    "rate": 1350,
                    "remarks": "4 shutters, 2 mirror, internal fittings included",
                },
                {
                    "room": "Master Bedroom",
                    "description": "Study nook with overhead shelf",
                    "unit": "sqft",
                    "raw_dimension": "4'x2'",
                    "qty": None,
                    "rate": 950,
                    "remarks": "Laminate finish, 2 shelves overhead",
                },
                {
                    "room": "Kids Bedroom",
                    "description": "Loft bed with under-storage drawers",
                    "unit": "nos",
                    "raw_dimension": None,
                    "qty": 1,
                    "rate": 38000,
                    "remarks": "4 drawers below, ladder included",
                },
                {
                    "room": "Kids Bedroom",
                    "description": "Study table with overhead shelf",
                    "unit": "sqft",
                    "raw_dimension": "4'x2'",
                    "qty": None,
                    "rate": 950,
                    "remarks": None,
                },
                {
                    "room": "Kids Bedroom",
                    "description": "Wardrobe",
                    "unit": "sqft",
                    "raw_dimension": "5'x7'",
                    "qty": None,
                    "rate": 1200,
                    "remarks": "3 shutters, laminate",
                },
                {
                    "room": "Guest Bedroom",
                    "description": "Wardrobe",
                    "unit": "sqft",
                    "raw_dimension": "5'x7'",
                    "qty": None,
                    "rate": 1200,
                    "remarks": "3 shutters, laminate",
                },
            ],
        },
        "status": CheckpointStatus.draft,
        "source": CheckpointSource.ai_extract,
        "added_to_quotation": False,
    },
    {
        # Revision checkpoint — client pushed back on pricing, scope tweaks
        "summary_text": (
            "Revision call after first quotation share.\n"
            "Client requested loft bed removed — replace with regular bed platform.\n"
            "Guest bedroom wardrobe reduced to 4×7 ft to save cost.\n"
            "Pooja unit added: 2×3 ft wall-hung with glass shutter.\n"
            "Utility area: washing machine platform + 2 overhead shelves.\n"
            "Client budget revised to 19 lakh firm; no curtains or loose furniture.\n"
            "Payment: 10% advance, balance milestone-based over 90 days."
        ),
        "structured_diff": {
            "meeting_minutes": [
                "Revision call after first quotation share",
                "Loft bed removed — replace with regular bed platform in kids bedroom",
                "Guest bedroom wardrobe reduced to 4×7 ft",
                "Pooja unit added: 2×3 ft wall-hung with glass shutter",
                "Utility: washing machine platform + 2 overhead shelves",
                "Budget revised to 19 lakh firm, no curtains or loose furniture",
                "Payment: 10% advance, milestone-based balance over 90 days",
            ],
            "line_items": [
                {
                    "room": "Kids Bedroom",
                    "description": "Bed platform with hydraulic storage",
                    "unit": "nos",
                    "raw_dimension": None,
                    "qty": 1,
                    "rate": 22000,
                    "remarks": "Replaces loft bed; hydraulic lift mechanism",
                },
                {
                    "room": "Guest Bedroom",
                    "description": "Wardrobe",
                    "unit": "sqft",
                    "raw_dimension": "4'x7'",
                    "qty": None,
                    "rate": 1200,
                    "remarks": "Reduced from 5×7 ft per client request",
                },
                {
                    "room": "Pooja Unit",
                    "description": "Wall-hung pooja unit with glass shutter",
                    "unit": "sqft",
                    "raw_dimension": "2'x3'",
                    "qty": None,
                    "rate": 1800,
                    "remarks": "Teak finish with glass door",
                },
                {
                    "room": "Utility",
                    "description": "Washing machine platform with overhead shelves",
                    "unit": "nos",
                    "raw_dimension": None,
                    "qty": 1,
                    "rate": 8500,
                    "remarks": "2 overhead shelves, WPC board",
                },
            ],
        },
        "status": CheckpointStatus.draft,
        "source": CheckpointSource.ai_extract,
        "added_to_quotation": False,
    },
]


def _reset_all_demo_clients(db) -> None:
    """Delete all demo clients by name so ON DELETE CASCADE handles children."""
    demo_names = [c["name"] for c in DEMO_CLIENTS]
    existing = db.query(Client).filter(Client.name.in_(demo_names)).all()
    if not db.info.get("scoped"):
        # Unscoped runs only ever touch business-less demo data.
        existing = [c for c in existing if c.business_id is None]
    for client in existing:
        db.execute(delete(Client).where(Client.id == client.id))
        logger.info(
            "Deleted existing demo client '%s' (%s)", client.name, client.id
        )
    db.flush()


def _seed_client(db, client_data: dict, admin_id, imported) -> None:
    """Create one demo client with checkpoints, design, and quotation."""
    client = Client(
        name=client_data["name"],
        contact_info=client_data["contact_info"],
        assigned_designer_id=admin_id,
        current_phase=client_data["current_phase"],
        notes=client_data["notes"],
    )
    db.add(client)
    db.flush()

    for cp in CHECKPOINTS:
        db.add(Checkpoint(client_id=client.id, **cp))

    design = Design(
        client_id=client.id,
        source=DesignSource.designer_uploaded,
        title=client_data["design_title"],
        description=client_data["design_description"],
        specs_json=DESIGN_SPECS,
        is_selected=True,
    )
    db.add(design)
    db.flush()

    quotation = Quotation(
        client_id=client.id,
        design_id=design.id,
        status=QuotationStatus.pending,
    )
    db.add(quotation)
    db.flush()

    for position, item in enumerate(imported.items):
        db.add(
            QuotationLineItem(
                quotation_id=quotation.id,
                room=item.room,
                position=position,
                description=item.description,
                catalog_type=item.catalog_type,
                unit=item.unit,
                raw_dimension=item.raw_dimension,
                computed_sqft=item.computed_sqft,
                qty=item.qty,
                rate=item.rate,
                initial_price=item.initial_price,
                negotiated_price=item.negotiated_price,
                remarks=item.remarks,
                status=item.status,
            )
        )

    logger.info(
        "  Seeded '%s' — quotation %s (%d line items)",
        client.name,
        quotation.id,
        len(imported.items),
    )


def _resolve_business_admin(db, business_name: str):
    """Return (business, admin user) for a business name, or (None, None)."""
    business = (
        db.query(Business)
        .filter(func.lower(Business.name) == business_name.lower())
        .first()
    )
    if not business:
        logger.error("Business '%s' not found.", business_name)
        return None, None
    users = db.query(User).filter(User.business_id == business.id).all()
    admin = next((u for u in users if u.role == UserRole.admin), None) or (
        users[0] if users else None
    )
    if not admin:
        logger.error(
            "Business '%s' has no users — add a first login for it in /admin.",
            business.name,
        )
        return business, None
    return business, admin


def seed(reset: bool = False, business_name: str | None = None) -> int:
    if not WORKBOOK_PATH.exists():
        logger.error("Quotation workbook not found: %s", WORKBOOK_PATH)
        return 1

    db = SessionLocal()
    try:
        if business_name:
            business, admin = _resolve_business_admin(db, business_name)
            if not admin:
                return 1
            # From here every query and insert is confined to this business.
            scope_session(db, business.id)
            logger.info("Seeding into business '%s'", business.name)
        else:
            admin = db.query(User).filter(User.role == UserRole.admin).first()
            if not admin:
                logger.error(
                    "No admin user found — start the API once to seed it."
                )
                return 1

        if reset:
            _reset_all_demo_clients(db)

        # --- Shared catalog: materials + margins (idempotent) ---
        for m in MATERIALS:
            exists = (
                db.query(MaterialRate)
                .filter(
                    MaterialRate.name == m["name"],
                    MaterialRate.category == m["category"],
                )
                .first()
            )
            if not exists:
                db.add(MaterialRate(**m))
        for mg in MARGINS:
            exists = (
                db.query(MarginConfig)
                .filter(MarginConfig.category == mg["category"])
                .first()
            )
            if not exists:
                db.add(MarginConfig(**mg))
        db.flush()

        # --- Parse workbook once, reuse for all clients ---
        imported = parse_workbook(WORKBOOK_PATH)
        for skipped in imported.skipped:
            logger.warning("Importer skipped: %s", skipped)

        seeded = 0
        demo_names = [c["name"] for c in DEMO_CLIENTS]
        existing_q = db.query(Client.name).filter(Client.name.in_(demo_names))
        if not business_name:
            existing_q = existing_q.filter(Client.business_id.is_(None))
        existing_names = {r.name for r in existing_q.all()}

        for client_data in DEMO_CLIENTS:
            if client_data["name"] in existing_names:
                logger.info(
                    "Skipping '%s' — already exists. Use --reset to re-seed.",
                    client_data["name"],
                )
                continue
            _seed_client(db, client_data, admin.id, imported)
            seeded += 1

        db.commit()
        logger.info(
            "Done — seeded %d/%d demo clients | materials: %d | checkpoints per client: %d",
            seeded,
            len(DEMO_CLIENTS),
            len(MATERIALS),
            len(CHECKPOINTS),
        )
        return 0
    except Exception:
        db.rollback()
        logger.exception("Seed failed — rolled back.")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo data.")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--business", help="Business name to seed into")
    args = parser.parse_args()
    sys.exit(seed(reset=args.reset, business_name=args.business))
