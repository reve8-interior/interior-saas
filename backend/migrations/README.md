# Alembic Migrations

All commands support `-x env=dev` (default) or `-x env=prod` to target the respective database via `.env.dev` / `.env.prod`.

## Check current revision

```bash
alembic -x env=dev current --verbose
alembic -x env=prod current --verbose
```

## View full migration history

```bash
alembic -x env=dev history
alembic -x env=prod history
```

## Apply all pending migrations

```bash
alembic -x env=dev upgrade head
alembic -x env=prod upgrade head
```

## Rollback one migration

```bash
alembic -x env=dev downgrade -1
alembic -x env=prod downgrade -1
```

## Rollback to a specific revision

```bash
alembic -x env=dev downgrade <revision_id>
alembic -x env=prod downgrade <revision_id>
```

## Create a new migration (autogenerate from model changes)

```bash
# Always run against dev
alembic -x env=dev revision --autogenerate -m "short description"
```

## Stamp without running migrations (fix alembic_version manually)

```bash
alembic -x env=dev stamp <revision_id>
alembic -x env=prod stamp <revision_id>
```

## Emergency: add a manually deleted column back

If a column was deleted outside of Alembic (alembic still thinks it's at head):

1. Add the column directly in the database — do **not** downgrade:
   ```sql
   ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column> <type>;
   ```
2. Alembic revision stays unchanged — no stamp needed.
