"""Postgres row-level security for per-business data isolation.

How it works:
- Tables that carry `business_id` (clients, materials_rates) are filtered by
  it directly; every other table that hangs off them is filtered through an
  EXISTS on its parent, which is itself RLS-filtered.
- Policies target the NOLOGIN role `portal_app`. Requests from business users
  run `SET LOCAL ROLE portal_app` and set `app.business_id`, so the policies
  apply even when the app connects as a superuser/table owner (who would
  otherwise bypass RLS). Superadmin requests keep the owner role and see all.
- `business_id` columns default to `app.business_id`, so inserts made inside
  a scoped request land in the caller's business without router changes.
"""

import uuid

from sqlalchemy import Connection, text

APP_ROLE = "portal_app"
SETTING = "app.business_id"
# Matches no real business: users without a business see nothing.
NO_BUSINESS = uuid.UUID(int=0)

BUSINESS_ID_DEFAULT = f"NULLIF(current_setting('{SETTING}', true), '')::uuid"

_BUSINESS_PREDICATE = f"business_id = {BUSINESS_ID_DEFAULT}"

# table -> policy predicate
_POLICIES: dict[str, str] = {
    "clients": _BUSINESS_PREDICATE,
    "materials_rates": _BUSINESS_PREDICATE,
    "client_access": "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)",
    "checkpoints": "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)",
    "designs": "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)",
    "design_hotspots": "EXISTS (SELECT 1 FROM designs d WHERE d.id = design_id)",
    "share_links": "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)",
    "portfolio_shares": _BUSINESS_PREDICATE,
    "final_summaries": "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)",
    "quotations": "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)",
    "quotation_versions": (
        "EXISTS (SELECT 1 FROM quotations q WHERE q.id = quotation_id)"
    ),
    "quotation_shares": (
        "EXISTS (SELECT 1 FROM quotation_versions v WHERE v.id = version_id)"
    ),
    "agent_audit_log": _BUSINESS_PREDICATE,
    # Supabase auto-enables RLS on every table; without a portal_app policy,
    # scoped writes to these match 0 rows (StaleDataError).
    "users": _BUSINESS_PREDICATE,
    "businesses": f"id = {BUSINESS_ID_DEFAULT}",
    "app_settings": "true",
    "audit_log": "true",
    "margin_config": "true",
    "quotation_line_items": (
        "EXISTS (SELECT 1 FROM quotations q WHERE q.id = quotation_id)"
    ),
}


def apply_rls(conn: Connection) -> None:
    """Create the app role, grants and policies. Safe to run repeatedly."""
    conn.exec_driver_sql(
        f"""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} NOLOGIN;
            END IF;
        END $$
        """
    )
    # Lets a non-superuser connection role switch to the app role.
    conn.exec_driver_sql(f"GRANT {APP_ROLE} TO CURRENT_USER")
    conn.exec_driver_sql(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    conn.exec_driver_sql(
        "GRANT SELECT, INSERT, UPDATE, DELETE "
        f"ON ALL TABLES IN SCHEMA public TO {APP_ROLE}"
    )
    conn.exec_driver_sql(
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}"
    )

    for table, predicate in _POLICIES.items():
        # Older migrations replay this before later tables are created.
        if (
            conn.exec_driver_sql(
                "SELECT to_regclass(%s)", (f"public.{table}",)
            ).scalar()
            is None
        ):
            continue
        conn.exec_driver_sql(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        conn.exec_driver_sql(
            f"DROP POLICY IF EXISTS business_isolation ON {table}"
        )
        conn.exec_driver_sql(
            f"CREATE POLICY business_isolation ON {table} TO {APP_ROLE} "
            f"USING ({predicate}) WITH CHECK ({predicate})"
        )


def scope_connection(conn: Connection, business_id: uuid.UUID | None) -> None:
    """Restrict the current transaction to one business's rows."""
    # One round trip: set_config('role', ...) is the function form of
    # SET LOCAL ROLE (is_local=true keeps it transaction-scoped).
    conn.execute(
        text(
            "SELECT set_config('role', :role, true), "
            "set_config(:name, :value, true)"
        ),
        {
            "role": APP_ROLE,
            "name": SETTING,
            "value": str(business_id or NO_BUSINESS),
        },
    )
