# StormGuest — Database Migrations

## Migration 001: Row Level Security (RLS)

File: `001_enable_rls.sql`

### What it does

Enables Supabase Row Level Security on all seven application tables to enforce
**multi-tenant data isolation at the database level**. Even if application code
had a bug that omitted a `WHERE hotel_id = ?` filter, the database would still
refuse to return rows from other hotels.

Tables covered: `hotels`, `guests`, `reservations`, `conversations`, `messages`,
`services`, `reviews`.

---

### How the isolation works

| JWT claim `role`  | Access granted                                      |
|-------------------|-----------------------------------------------------|
| `super_admin`     | All rows in all tables (no hotel filter)            |
| `hotel_manager`   | Only rows where `hotel_id` matches JWT `hotel_id`  |
| `reception`       | Same as hotel_manager (read + write own hotel)     |
| service_role key  | Bypasses RLS entirely (used by the backend server) |

The `messages` table has no `hotel_id` column — its policies enforce isolation
via a subquery join through `conversations.hotel_id`.

---

### How to apply

**Method 1 — Supabase Dashboard (recommended)**

1. Open your Supabase project at [https://supabase.com](https://supabase.com).
2. Navigate to **SQL Editor** in the left sidebar.
3. Click **New query**.
4. Copy and paste the entire contents of `001_enable_rls.sql`.
5. Click **Run** (or press `Ctrl+Enter`).
6. Confirm success by running the verification queries at the bottom of the file.

**Method 2 — Supabase CLI**

```bash
supabase db push
# or
psql "$DATABASE_URL" -f migrations/001_enable_rls.sql
```

> Note: Use the `postgres` superuser connection string (found in Supabase
> Dashboard > Settings > Database), **not** the `service_role` or `anon` key.

---

### Order of application

This is the first and only migration. If you add future migrations:

- Always run them in numerical order (`001_`, `002_`, ...).
- Do not modify a migration once it has been applied to production. Create a
  new migration instead.
- The `DROP POLICY IF EXISTS` statements in this file make it **idempotent**
  (safe to re-run).

---

### Important warnings

**Do NOT run application code as `anon` role without first testing your
policies.** The anon role is not listed in the `TO authenticated` clause, so
anonymous callers will be blocked from all tables by default — which is the
correct behavior for StormGuest.

**The backend server uses `SUPABASE_SERVICE_ROLE_KEY`**, which bypasses RLS
entirely. This is intentional: the server already enforces hotel scoping at the
application layer (middleware). RLS is the second line of defense for direct
database access or Supabase client calls with user JWTs.

**If you add a new table**, remember to:
1. `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;`
2. Create at minimum a restrictive default (`DENY ALL`) or explicit policies.
   A table with RLS enabled but no policies will deny all access to
   non-superuser roles.

---

### Verifying RLS is active

Run this query in the SQL Editor after applying the migration:

```sql
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'hotels','guests','reservations',
    'conversations','messages','services','reviews'
  );
```

All rows should show `rowsecurity = true`.

To inspect individual policies:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

### Helper functions installed

| Function             | Returns | Purpose                                      |
|----------------------|---------|----------------------------------------------|
| `current_hotel_id()` | `text`  | Extracts `hotel_id` from the JWT claims      |
| `current_user_role()`| `text`  | Extracts `role` from the JWT claims          |

Both are defined as `SECURITY DEFINER` and `STABLE` for safe, efficient reuse
inside policy expressions.
