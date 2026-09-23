# Database Migration & Schema Evolution Runbook

This runbook defines the operational procedure for executing production database schema migrations on the CareerForge platform using Prisma ORM.

> [!CAUTION]
> **NEVER RUN `prisma migrate dev` IN PRODUCTION.**  
> `prisma migrate dev` creates new migrations interactively and may reset the database if schema drift is detected.  
> In all production and staging environments, **strictly use `npx prisma migrate deploy`**.

---

## 1. Migration Philosophy & Rules of Safety

1. **Non-Destructive Evolution (Expand / Contract Pattern)**:
   - Schema modifications must be backwards-compatible with running application versions.
   - Column additions must be nullable or provide non-null defaults.
   - Column deletions or renames must occur over multiple deployment cycles:
     1. *Phase 1 (Expand)*: Add new column; write to both old and new columns.
     2. *Phase 2 (Migrate Data)*: Backfill historical rows.
     3. *Phase 3 (Contract)*: Shift all reads/writes to new column; remove old column from code.
     4. *Phase 4 (Cleanup)*: Drop old column in a subsequent migration.
2. **Deterministic Versioning**:
   - All migrations are tracked in `apps/api/prisma/migrations/`.
   - Migration directories must be committed to Git and validated through CI before applying to production.

---

## 2. Pre-Migration Checklist (Before Running)

| Step | Action | Command / Procedure | Responsibility |
| :--- | :--- | :--- | :--- |
| **1. Snapshot** | Create automated point-in-time recovery (PITR) snapshot or pg_dump | `pg_dump -Fc -v -d "$DATABASE_URL" -f "pre_migration_$(date +%Y%m%d_%H%M%S).dump"` | Infrastructure Operator |
| **2. Verify DDL** | Review generated SQL inside `apps/api/prisma/migrations/<timestamp>_*/migration.sql` | Inspect for table locks, `ACCESS EXCLUSIVE`, or full-table scans | Database Reviewer |
| **3. Connection Check** | Verify network connectivity, SSL requirement, and schema permissions | `psql "$DATABASE_URL" -c "SELECT current_database(), current_user;"` | Operator / CI Runner |
| **4. Maintenance Window** | For migrations adding heavy indexes, use `CREATE INDEX CONCURRENTLY` | Ensure minimal connection pool contention during peak traffic | Operations Team |

---

## 3. Migration Execution Procedure

Run the migration command from within the API workspace or passing the schema path explicitly:

```bash
# Execute pending applied migrations against the production database
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```

### Expected Output:
```text
Prisma schema loaded from apps/api/prisma/schema.prisma
Datasource "db": PostgreSQL database "careerforge_production", schema "public" at "db.example.com:5432"

1 migration found in prisma/migrations

Applying migration `20260923000000_phase8_readiness`

The following migration has been applied:

migrations/
  └─ 20260923000000_phase8_readiness/
      └─ migration.sql

All migrations have been successfully applied.
```

---

## 4. Deployment Sequencing

To ensure zero-downtime deployments:

```
[ Step 1: Pre-Migration Backup ]
              │
              ▼
[ Step 2: Apply Schema Migration ] ──> npx prisma migrate deploy
              │
              ▼
[ Step 3: Rolling Update of API Containers ]
              │
              ▼
[ Step 4: Verification of Readiness Probes ] ──> GET /ready (HTTP 200)
              │
              ▼
[ Step 5: Update Web SPA Static Bundles ]
```

---

## 5. Rollback & Disaster Recovery Strategy

1. **Transactional Migrations**:
   - PostgreSQL executes DDL operations within a transaction. If any statement in `migration.sql` fails, PostgreSQL automatically rolls back the entire migration without leaving partial state.
2. **Schema Rollback**:
   - Prisma does not provide automatic down-migrations. If a migration applied cleanly but causes unexpected runtime issues, generate a forward-compensating migration:
     ```bash
     # Generate forward-compensating migration locally
     npx prisma migrate dev --name revert_feature_x
     # Apply to staging and production
     npx prisma migrate deploy
     ```
3. **Database Restore**:
   - If severe corruption occurs, restore the pre-migration snapshot taken in Step 2.1 via cloud provider console or `pg_restore`.

---

## 6. Post-Migration Verification

Immediately following migration deployment:

1. **Verify Migration Ledger**:
   ```bash
   npx prisma migrate status --schema=apps/api/prisma/schema.prisma
   ```
   *Expected: `Database schema is up to date!`*
2. **Verify Application Readiness**:
   ```bash
   curl -i https://api.careerforge.dev/ready
   ```
   *Expected: HTTP 200 OK with `database: "connected"`, `queue: "active"`.*
