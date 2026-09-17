-- Migration 0001_init
-- Base schema derived directly from prisma/schema.prisma (Month-1 entities only).
-- Hand-applied because the Prisma engine binary could not be downloaded in this
-- sandboxed environment (binaries.prisma.sh is not in the allowed egress list).
-- This DDL is the literal SQL equivalent of schema.prisma and should produce the
-- identical result `prisma migrate dev` would generate, so it can be reconciled
-- against a real `prisma migrate diff` the next time engine binaries are reachable.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram indexes for normalized_name matching (ERD §7/§8)

-- ============================================================================
-- PLATFORM-LEVEL (no tenant_id, no RLS)
-- ============================================================================

CREATE TABLE tenant (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  subdomain  text NOT NULL UNIQUE,
  status     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permission (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  description text,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jurisdiction (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE region (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdiction(id),
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, name)
);

CREATE TABLE forum_type (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE court_forum (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id     uuid NOT NULL REFERENCES region(id),
  forum_type_id uuid NOT NULL REFERENCES forum_type(id),
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, forum_type_id, name)
);
CREATE INDEX idx_court_forum_forum_type_id ON court_forum(forum_type_id);

CREATE TABLE bench (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_forum_id uuid NOT NULL REFERENCES court_forum(id),
  name           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (court_forum_id, name)
);

CREATE TABLE case_type (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forum_type_id uuid NOT NULL REFERENCES forum_type(id),
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (forum_type_id, name)
);

-- ============================================================================
-- TENANT-SCOPED — Identity / RBAC / Entitlements
-- ============================================================================

CREATE TABLE office (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  name       text NOT NULL,
  region_id  uuid REFERENCES region(id),
  is_primary boolean NOT NULL DEFAULT false,
  address    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_office_tenant_id ON office(tenant_id);

CREATE TABLE "user" (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  primary_office_id uuid REFERENCES office(id),
  email             text NOT NULL,
  password_hash     text NOT NULL,
  user_type         text NOT NULL,
  full_name         text NOT NULL,
  status            text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_user_tenant_id ON "user"(tenant_id);

CREATE TABLE role (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(id),
  name                  text NOT NULL,
  is_system_default     boolean NOT NULL DEFAULT false,
  applies_to_user_type  text NOT NULL DEFAULT 'staff',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_role_tenant_id ON role(tenant_id);

CREATE TABLE role_permission (
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  role_id       uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES permission(id),
  PRIMARY KEY (tenant_id, role_id, permission_id),
  FOREIGN KEY (role_id, tenant_id) REFERENCES role(id, tenant_id)
);

CREATE TABLE user_role (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  user_id   uuid NOT NULL,
  role_id   uuid NOT NULL,
  office_id uuid,
  FOREIGN KEY (user_id, tenant_id) REFERENCES "user"(id, tenant_id),
  FOREIGN KEY (role_id, tenant_id) REFERENCES role(id, tenant_id),
  FOREIGN KEY (office_id, tenant_id) REFERENCES office(id, tenant_id),
  UNIQUE (user_id, role_id, office_id)
);
CREATE INDEX idx_user_role_tenant_id ON user_role(tenant_id);
CREATE INDEX idx_user_role_user_id ON user_role(user_id);

CREATE TABLE tenant_feature (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  plan_tier   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_key)
);

-- ============================================================================
-- TENANT-SCOPED — Clients & Contacts
-- ============================================================================

CREATE TABLE client (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  client_type        text NOT NULL,
  display_name       text NOT NULL,
  normalized_name    text NOT NULL,
  billing_contact_id uuid,
  status             text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_client_tenant_id ON client(tenant_id);
CREATE INDEX idx_client_normalized_name_trgm ON client USING gin (normalized_name gin_trgm_ops);

CREATE TABLE contact (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  full_name       text NOT NULL,
  normalized_name text NOT NULL,
  contact_type    text NOT NULL,
  email           text,
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_contact_tenant_id ON contact(tenant_id);
CREATE INDEX idx_contact_normalized_name_trgm ON contact USING gin (normalized_name gin_trgm_ops);

-- client.billing_contact_id -> contact.id (simple FK, not composite — matches ERD §7 exactly)
ALTER TABLE client ADD FOREIGN KEY (billing_contact_id) REFERENCES contact(id);

CREATE TABLE client_contact (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id),
  client_id    uuid NOT NULL,
  contact_id   uuid NOT NULL,
  relationship text NOT NULL,
  FOREIGN KEY (client_id, tenant_id) REFERENCES client(id, tenant_id),
  FOREIGN KEY (contact_id, tenant_id) REFERENCES contact(id, tenant_id),
  UNIQUE (client_id, contact_id, relationship)
);

-- ============================================================================
-- TENANT-SCOPED — Matters, Participants, Proceedings
-- ============================================================================

CREATE TABLE matter (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(id),
  matter_number           text NOT NULL,
  title                   text NOT NULL,
  client_id               uuid NOT NULL REFERENCES client(id),
  office_id               uuid NOT NULL REFERENCES office(id),
  practice_area_id        uuid,
  responsible_attorney_id uuid REFERENCES "user"(id),
  status                  text NOT NULL,
  opened_date             date,
  closed_date             date,
  deleted_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, matter_number),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_matter_tenant_client ON matter(tenant_id, client_id);
CREATE INDEX idx_matter_tenant_status ON matter(tenant_id, status);

CREATE TABLE tenant_case_type (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(id),
  forum_type_id         uuid NOT NULL REFERENCES forum_type(id),
  based_on_case_type_id uuid REFERENCES case_type(id),
  name                  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, forum_type_id, name),
  UNIQUE (id, tenant_id)
);

CREATE TABLE proceeding (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(id),
  matter_id                   uuid NOT NULL,
  court_forum_id              uuid NOT NULL REFERENCES court_forum(id),
  bench_id                    uuid REFERENCES bench(id),
  platform_case_type_id       uuid REFERENCES case_type(id),
  tenant_case_type_id         uuid,
  case_number                 text,
  filing_diary_number         text,
  filing_date                 date,
  external_case_reference_id  text,
  physical_file_location      text,
  status                      text NOT NULL,
  proceeding_custom_fields    jsonb,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (matter_id, tenant_id) REFERENCES matter(id, tenant_id),
  FOREIGN KEY (tenant_case_type_id, tenant_id) REFERENCES tenant_case_type(id, tenant_id),
  UNIQUE (id, matter_id),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_proceeding_tenant_matter ON proceeding(tenant_id, matter_id);
CREATE INDEX idx_proceeding_tenant_court_forum ON proceeding(tenant_id, court_forum_id);
CREATE INDEX idx_proceeding_tenant_status ON proceeding(tenant_id, status);

CREATE TABLE matter_participant (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  matter_id     uuid NOT NULL,
  proceeding_id uuid,
  contact_id    uuid,
  client_id     uuid,
  role          text NOT NULL,
  FOREIGN KEY (matter_id, tenant_id) REFERENCES matter(id, tenant_id),
  FOREIGN KEY (proceeding_id, matter_id) REFERENCES proceeding(id, matter_id),
  FOREIGN KEY (contact_id, tenant_id) REFERENCES contact(id, tenant_id),
  FOREIGN KEY (client_id, tenant_id) REFERENCES client(id, tenant_id)
);
CREATE INDEX idx_matter_participant_tenant_matter ON matter_participant(tenant_id, matter_id);
CREATE INDEX idx_matter_participant_tenant_proceeding ON matter_participant(tenant_id, proceeding_id);

CREATE TABLE proceeding_status_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  proceeding_id      uuid NOT NULL,
  previous_status    text,
  new_status         text NOT NULL,
  note               text,
  changed_by_user_id uuid NOT NULL REFERENCES "user"(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (proceeding_id, tenant_id) REFERENCES proceeding(id, tenant_id)
);
CREATE INDEX idx_proceeding_status_history_lookup ON proceeding_status_history(tenant_id, proceeding_id, created_at);

-- ============================================================================
-- TENANT-SCOPED — Assignment (nullable-FK-plus-CHECK design, ERD §12)
-- ============================================================================

CREATE TABLE assignment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant(id),
  matter_id      uuid,
  proceeding_id  uuid,
  user_id        uuid NOT NULL,
  role           text NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,
  FOREIGN KEY (matter_id, tenant_id) REFERENCES matter(id, tenant_id),
  FOREIGN KEY (proceeding_id, tenant_id) REFERENCES proceeding(id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES "user"(id, tenant_id)
);
CREATE INDEX idx_assignment_tenant_matter ON assignment(tenant_id, matter_id) WHERE matter_id IS NOT NULL;
CREATE INDEX idx_assignment_tenant_proceeding ON assignment(tenant_id, proceeding_id) WHERE proceeding_id IS NOT NULL;
CREATE INDEX idx_assignment_tenant_user ON assignment(tenant_id, user_id);

-- ============================================================================
-- TENANT-SCOPED — Conflicts Checking (nullable-FK-plus-CHECK design, ERD §13)
-- ============================================================================

CREATE TABLE conflict_check (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(id),
  triggered_by_client_id      uuid,
  triggered_by_contact_id     uuid,
  triggered_by_matter_id      uuid,
  triggered_by_proceeding_id  uuid,
  search_name                 text NOT NULL,
  run_by_user_id               uuid NOT NULL,
  cleared_by_user_id           uuid,
  cleared_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (triggered_by_client_id, tenant_id) REFERENCES client(id, tenant_id),
  FOREIGN KEY (triggered_by_contact_id, tenant_id) REFERENCES contact(id, tenant_id),
  FOREIGN KEY (triggered_by_matter_id, tenant_id) REFERENCES matter(id, tenant_id),
  FOREIGN KEY (triggered_by_proceeding_id, tenant_id) REFERENCES proceeding(id, tenant_id),
  FOREIGN KEY (run_by_user_id, tenant_id) REFERENCES "user"(id, tenant_id),
  FOREIGN KEY (cleared_by_user_id, tenant_id) REFERENCES "user"(id, tenant_id),
  UNIQUE (id, tenant_id)
);
CREATE INDEX idx_conflict_check_tenant_created ON conflict_check(tenant_id, created_at);

CREATE TABLE conflict_match (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  conflict_check_id   uuid NOT NULL,
  matched_client_id   uuid,
  matched_contact_id  uuid,
  similarity_score    numeric NOT NULL,
  decision            text NOT NULL,
  decided_by_user_id  uuid,
  FOREIGN KEY (conflict_check_id, tenant_id) REFERENCES conflict_check(id, tenant_id),
  FOREIGN KEY (matched_client_id, tenant_id) REFERENCES client(id, tenant_id),
  FOREIGN KEY (matched_contact_id, tenant_id) REFERENCES contact(id, tenant_id),
  FOREIGN KEY (decided_by_user_id, tenant_id) REFERENCES "user"(id, tenant_id)
);
CREATE INDEX idx_conflict_match_tenant_check ON conflict_match(tenant_id, conflict_check_id);

-- ============================================================================
-- TENANT-SCOPED — Audit Log (deliberate polymorphic exception, ERD §15)
-- ============================================================================

CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  resource_type text NOT NULL,
  resource_id   uuid NOT NULL, -- deliberately no FK — spans every entity type, see ERD §15
  event         text NOT NULL,
  actor_id      uuid,
  metadata      jsonb,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_id, tenant_id) REFERENCES "user"(id, tenant_id)
);
CREATE INDEX idx_audit_log_resource ON audit_log(tenant_id, resource_type, resource_id);
CREATE INDEX idx_audit_log_actor ON audit_log(tenant_id, actor_id, created_at);
CREATE INDEX idx_audit_log_created ON audit_log(tenant_id, created_at);
