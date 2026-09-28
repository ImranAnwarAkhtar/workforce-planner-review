-- =============================================================================
-- Equinix GDC Workforce Planning Application
-- PostgreSQL Database Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- REFERENCE / LOOKUP TABLES
-- =============================================================================

CREATE TABLE regions (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    code       VARCHAR(20)  NOT NULL UNIQUE
                   CHECK (code IN ('AMER', 'AMER_MATRIX', 'APAC', 'EMEA_N', 'EMEA_S', 'EMEA_C', 'MEA', 'GLOBAL')),
    sort_order INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE countries (
    id                 SERIAL       PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    code               CHAR(3)      NOT NULL UNIQUE,
    region_id          INTEGER      NOT NULL REFERENCES regions(id),
    is_emerging_market BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order         INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE disciplines (
    id   SERIAL       PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE levels (
    id           SERIAL      PRIMARY KEY,
    level_number INTEGER,
    level_name   VARCHAR(100) NOT NULL UNIQUE,
    short_code   VARCHAR(10)  NOT NULL UNIQUE
);

CREATE TABLE contract_types (
    id          SERIAL       PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    description VARCHAR(100) NOT NULL,
    category    VARCHAR(20)  NOT NULL CHECK (category IN ('existing', 'approved', 'requested')),
    colour_hex  CHAR(6)      NOT NULL
);

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE users (
    id         SERIAL       PRIMARY KEY,
    auth0_id   VARCHAR(255) NOT NULL UNIQUE,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    role       VARCHAR(50)  NOT NULL CHECK (role IN (
                   'PMO', 'Department Lead', 'Function Lead', 'Workforce Planning',
                   'Head of Commercial', 'Head of Department', 'EVP', 'Finance'
               )),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CORE BUSINESS TABLES
-- =============================================================================

CREATE TABLE tbh_codes (
    id                  SERIAL       PRIMARY KEY,
    tbh_id              VARCHAR(50)  NOT NULL UNIQUE,
    old_tbh             VARCHAR(50),
    funding_year        INTEGER,
    hire_type           VARCHAR(50),
    region_id           INTEGER      REFERENCES regions(id),
    project_type        VARCHAR(20)  CHECK (project_type IN ('Retail', 'xScale', 'Matrix')),
    legal_entity        VARCHAR(100),
    location_code       VARCHAR(20),
    cost_centre         VARCHAR(50),
    job_profile         VARCHAR(100),
    replaced_emp_name   VARCHAR(255),
    manager_name        VARCHAR(255),
    target_hire_date    DATE,
    jr_id               VARCHAR(50),
    req_status          VARCHAR(50),
    ta_contact          VARCHAR(255),
    candidate_name      VARCHAR(255),
    estimated_hire_date DATE,
    ta_status_comments  TEXT,
    tbh_description     TEXT,
    fp_and_a_notes      TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id         SERIAL        PRIMARY KEY,
    name       VARCHAR(255)  NOT NULL,
    type       VARCHAR(20)   NOT NULL CHECK (type IN ('Retail', 'xScale', 'Matrix')),
    status     VARCHAR(20)   NOT NULL CHECK (status IN ('Approved', 'Seeded', 'Proposed')),
    weight     DECIMAL(4,2)  NOT NULL DEFAULT 1.0,
    region_id  INTEGER       REFERENCES regions(id),
    country_id INTEGER       REFERENCES countries(id),
    metro      VARCHAR(100),
    phase_code VARCHAR(50),
    year       INTEGER,
    is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by INTEGER       REFERENCES users(id),
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE people (
    id               SERIAL       PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    contract_type_id INTEGER      REFERENCES contract_types(id),
    level_id         INTEGER      REFERENCES levels(id),
    discipline_id    INTEGER      REFERENCES disciplines(id),
    contracted_fte   DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    tbh_code_id      INTEGER      REFERENCES tbh_codes(id),
    workday_jr_id    VARCHAR(50),
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- JUNCTION TABLES
-- =============================================================================

CREATE TABLE person_regions (
    id        SERIAL  PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    region_id INTEGER NOT NULL REFERENCES regions(id),
    UNIQUE (person_id, region_id)
);

CREATE TABLE person_countries (
    id         SERIAL  PRIMARY KEY,
    person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    country_id INTEGER NOT NULL REFERENCES countries(id),
    UNIQUE (person_id, country_id)
);

-- =============================================================================
-- OPERATIONAL TABLES
-- =============================================================================

CREATE TABLE allocations (
    id                 SERIAL       PRIMARY KEY,
    person_id          INTEGER      NOT NULL REFERENCES people(id),
    project_id         INTEGER      NOT NULL REFERENCES projects(id),
    month              DATE         NOT NULL,
    fte_value          DECIMAL(4,2) NOT NULL DEFAULT 0.0,
    is_billable        BOOLEAN      NOT NULL DEFAULT TRUE,
    flagged_for_review BOOLEAN      NOT NULL DEFAULT FALSE,
    flag_reason        TEXT,
    created_by         INTEGER      REFERENCES users(id),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (person_id, project_id, month)
);

CREATE TABLE gearing_constants (
    id            SERIAL       PRIMARY KEY,
    discipline_id INTEGER      NOT NULL REFERENCES disciplines(id),
    project_type  VARCHAR(20)  NOT NULL CHECK (project_type IN ('Retail', 'xScale', 'EM')),
    min_divisor   DECIMAL(4,2) NOT NULL,
    max_divisor   DECIMAL(4,2) NOT NULL,
    updated_by    INTEGER      REFERENCES users(id),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (discipline_id, project_type)
);

-- =============================================================================
-- WORKFLOW / REQUEST TABLES
-- =============================================================================

CREATE TABLE hire_requests (
    id                 SERIAL      PRIMARY KEY,
    request_type       VARCHAR(30) NOT NULL CHECK (request_type IN (
                           'New FTE', 'New Contingent', 'Convert to FTE', 'Convert to Contingent'
                       )),
    discipline_id      INTEGER     REFERENCES disciplines(id),
    level_id           INTEGER     REFERENCES levels(id),
    contract_type_id   INTEGER     REFERENCES contract_types(id),
    region_id          INTEGER     REFERENCES regions(id),
    country_id         INTEGER     REFERENCES countries(id),
    project_id         INTEGER     REFERENCES projects(id),
    justification      TEXT,
    status             VARCHAR(50) NOT NULL DEFAULT 'Pending',
    stage              INTEGER     NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 4),
    submitted_by       INTEGER     REFERENCES users(id),
    stage2_user_id     INTEGER     REFERENCES users(id),
    stage2_approved_at TIMESTAMPTZ,
    stage3_user_id     INTEGER     REFERENCES users(id),
    stage3_approved_at TIMESTAMPTZ,
    stage4_user_id     INTEGER     REFERENCES users(id),
    stage4_approved_at TIMESTAMPTZ,
    rejected_by        INTEGER     REFERENCES users(id),
    rejected_at        TIMESTAMPTZ,
    rejection_reason   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE change_requests (
    id                        SERIAL      PRIMARY KEY,
    tbh_code_id               INTEGER     REFERENCES tbh_codes(id),
    change_type               VARCHAR(50) NOT NULL CHECK (change_type IN (
                                  'Move Region/Country', 'Change Manager', 'Change Level or Role',
                                  'Borrow or Repurpose HC', 'Cancel TBH',
                                  'Convert Retail to xScale', 'Convert xScale to Retail'
                              )),
    current_manager           VARCHAR(255),
    new_manager               VARCHAR(255),
    new_region_id             INTEGER     REFERENCES regions(id),
    new_country_id            INTEGER     REFERENCES countries(id),
    new_level_id              INTEGER     REFERENCES levels(id),
    new_metro_location        VARCHAR(100),
    is_borrowed_or_repurposed BOOLEAN,
    justification             TEXT,
    approval_type             VARCHAR(100),
    senior_approver           VARCHAR(255),
    senior_approver_status    VARCHAR(20)  DEFAULT 'N/A',
    xscale_vs_retail          VARCHAR(10),
    requestor_email           VARCHAR(255),
    comments                  TEXT,
    reviewer_notes            TEXT,
    status                    VARCHAR(20) NOT NULL CHECK (status IN (
                                  'Pending', 'Auto-Approved', 'Approved', 'Rejected'
                              )),
    auto_approved             BOOLEAN     NOT NULL DEFAULT FALSE,
    submitted_by              INTEGER     REFERENCES users(id),
    approved_by               INTEGER     REFERENCES users(id),
    approved_at               TIMESTAMPTZ,
    rejection_reason          TEXT,
    finance_notified_at       TIMESTAMPTZ,
    new_tbh_code_assigned     VARCHAR(50),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent ALTER for live DB upgrades (safe to re-run)
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS new_metro_location     VARCHAR(100);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS approval_type          VARCHAR(100);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS senior_approver        VARCHAR(255);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS senior_approver_status VARCHAR(20)  DEFAULT 'N/A';
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS xscale_vs_retail       VARCHAR(10);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS requestor_email        VARCHAR(255);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS comments               TEXT;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS reviewer_notes         TEXT;

-- =============================================================================
-- PLANNING TABLES
-- =============================================================================

CREATE TABLE planning_snapshots (
    id            SERIAL      PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    cycle         VARCHAR(10)  NOT NULL CHECK (cycle IN ('Q1', 'Q3', 'Ad-hoc')),
    year          INTEGER      NOT NULL,
    snapshot_date DATE         NOT NULL,
    data          JSONB        NOT NULL DEFAULT '{}',
    created_by    INTEGER      REFERENCES users(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE planning_years (
    id               SERIAL      PRIMARY KEY,
    year             INTEGER     NOT NULL UNIQUE,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    copied_from_year INTEGER,
    created_by       INTEGER     REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SYSTEM / CONFIG TABLES
-- =============================================================================

CREATE TABLE audit_log (
    id            SERIAL       PRIMARY KEY,
    timestamp     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    user_id       INTEGER,
    user_name     VARCHAR(255),
    user_role     VARCHAR(50),
    action_type   VARCHAR(50)  NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id   INTEGER,
    old_value     JSONB,
    new_value     JSONB,
    ip_address    INET,
    user_agent    TEXT,
    session_id    VARCHAR(255)
);

CREATE TABLE hierarchy_config (
    id          SERIAL      PRIMARY KEY,
    view_name   VARCHAR(10) NOT NULL UNIQUE CHECK (view_name IN ('view1', 'view2')),
    level_order JSONB       NOT NULL DEFAULT '[]',
    updated_by  INTEGER     REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE colour_thresholds (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(50)  NOT NULL,
    min_fte    DECIMAL(4,2),
    max_fte    DECIMAL(4,2),
    colour_hex CHAR(6)      NOT NULL,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    updated_by INTEGER      REFERENCES users(id)
);

CREATE TABLE finance_settings (
    id                  SERIAL      PRIMARY KEY,
    notification_emails TEXT,
    updated_by          INTEGER     REFERENCES users(id),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE change_request_rules (
    id           SERIAL      PRIMARY KEY,
    change_type  TEXT        NOT NULL UNIQUE,
    auto_approve BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_by   INTEGER     REFERENCES users(id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- countries
CREATE INDEX idx_countries_region_id ON countries(region_id);

-- tbh_codes
CREATE INDEX idx_tbh_codes_region_id    ON tbh_codes(region_id);
CREATE UNIQUE INDEX idx_tbh_codes_tbh_id ON tbh_codes(tbh_id);

-- projects
CREATE INDEX idx_projects_region_id        ON projects(region_id);
CREATE INDEX idx_projects_country_id       ON projects(country_id);
CREATE INDEX idx_projects_created_by       ON projects(created_by);
CREATE INDEX idx_projects_region_year_status ON projects(region_id, year, status);

-- people
CREATE INDEX idx_people_contract_type_id     ON people(contract_type_id);
CREATE INDEX idx_people_level_id             ON people(level_id);
CREATE INDEX idx_people_discipline_id        ON people(discipline_id);
CREATE INDEX idx_people_tbh_code_id          ON people(tbh_code_id);
CREATE INDEX idx_people_discipline_contract  ON people(discipline_id, contract_type_id);

-- person_regions
CREATE INDEX idx_person_regions_person_id ON person_regions(person_id);
CREATE INDEX idx_person_regions_region_id ON person_regions(region_id);

-- person_countries
CREATE INDEX idx_person_countries_person_id  ON person_countries(person_id);
CREATE INDEX idx_person_countries_country_id ON person_countries(country_id);

-- allocations
CREATE INDEX idx_allocations_person_id      ON allocations(person_id);
CREATE INDEX idx_allocations_project_id     ON allocations(project_id);
CREATE INDEX idx_allocations_created_by     ON allocations(created_by);
CREATE INDEX idx_allocations_person_month   ON allocations(person_id, month);
CREATE INDEX idx_allocations_project_month  ON allocations(project_id, month);

-- gearing_constants
CREATE INDEX idx_gearing_constants_discipline_id ON gearing_constants(discipline_id);

-- hire_requests
CREATE INDEX idx_hire_requests_discipline_id    ON hire_requests(discipline_id);
CREATE INDEX idx_hire_requests_level_id         ON hire_requests(level_id);
CREATE INDEX idx_hire_requests_contract_type_id ON hire_requests(contract_type_id);
CREATE INDEX idx_hire_requests_region_id        ON hire_requests(region_id);
CREATE INDEX idx_hire_requests_country_id       ON hire_requests(country_id);
CREATE INDEX idx_hire_requests_project_id       ON hire_requests(project_id);
CREATE INDEX idx_hire_requests_submitted_by     ON hire_requests(submitted_by);

-- change_requests
CREATE INDEX idx_change_requests_tbh_code_id   ON change_requests(tbh_code_id);
CREATE INDEX idx_change_requests_new_region_id  ON change_requests(new_region_id);
CREATE INDEX idx_change_requests_new_country_id ON change_requests(new_country_id);
CREATE INDEX idx_change_requests_new_level_id   ON change_requests(new_level_id);
CREATE INDEX idx_change_requests_submitted_by   ON change_requests(submitted_by);
CREATE INDEX idx_change_requests_approved_by    ON change_requests(approved_by);

-- planning_snapshots
CREATE INDEX idx_planning_snapshots_created_by ON planning_snapshots(created_by);

-- planning_years
CREATE INDEX idx_planning_years_created_by ON planning_years(created_by);

-- audit_log
CREATE INDEX idx_audit_log_timestamp_user_resource ON audit_log(timestamp, user_id, resource_type);

-- =============================================================================
-- TRIGGER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Immutable audit log
CREATE TRIGGER trg_prevent_audit_log_modification
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- =============================================================================
-- ACCESS PROFILES MIGRATION (idempotent — safe to re-run)
-- =============================================================================

-- People: visible system profile badge in the People section
ALTER TABLE people ADD COLUMN IF NOT EXISTS system_profile VARCHAR(50);

-- Users: new profile name + access tier override
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_profile VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_tier    VARCHAR(20) NOT NULL DEFAULT 'standard';

-- Auto-update updated_at on every table that carries that column
CREATE TRIGGER trg_tbh_codes_updated_at
    BEFORE UPDATE ON tbh_codes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_people_updated_at
    BEFORE UPDATE ON people
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_allocations_updated_at
    BEFORE UPDATE ON allocations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_gearing_constants_updated_at
    BEFORE UPDATE ON gearing_constants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_hierarchy_config_updated_at
    BEFORE UPDATE ON hierarchy_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_finance_settings_updated_at
    BEFORE UPDATE ON finance_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_change_request_rules_updated_at
    BEFORE UPDATE ON change_request_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
