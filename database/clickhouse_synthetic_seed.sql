-- ClickHouse Synthetic Lead Dataset Schema
-- Contains edge cases: Nullable types, Arrays, LowCardinality, Restricted columns, and an Unapproved table for security tests.

CREATE DATABASE IF NOT EXISTS leadgen_warehouse;

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS leadgen_warehouse.synthetic_companies (
    company_id UInt64,
    name String,
    domain String,
    industry LowCardinality(String),
    country LowCardinality(String),
    city String,
    employee_count UInt32,
    annual_revenue_usd Float64,
    technologies Array(String),
    funding_stage LowCardinality(Nullable(String)),
    founded_year UInt16,
    confidential_arr Nullable(Float64), -- RESTRICTED: admin/internal only
    created_at DateTime
) ENGINE = MergeTree()
PRIMARY KEY (company_id)
ORDER BY (company_id, country, industry);

-- 2. Contacts Table
CREATE TABLE IF NOT EXISTS leadgen_warehouse.synthetic_contacts (
    contact_id UInt64,
    company_id UInt64,
    first_name String,
    last_name String,
    full_name String,
    job_title String,
    seniority_level LowCardinality(String),
    department LowCardinality(String),
    work_email String,
    direct_phone Nullable(String), -- RESTRICTED: admin only
    country LowCardinality(String),
    linkedin_url Nullable(String),
    is_verified UInt8,
    created_at DateTime
) ENGINE = MergeTree()
PRIMARY KEY (contact_id)
ORDER BY (contact_id, company_id);

-- 3. Unapproved Table (For testing join security: candidate relationship inferred but NOT approved)
CREATE TABLE IF NOT EXISTS leadgen_warehouse.synthetic_raw_events (
    event_id UInt64,
    company_id UInt64,
    event_type String,
    raw_payload String,
    event_time DateTime
) ENGINE = MergeTree()
PRIMARY KEY (event_id)
ORDER BY (event_id, company_id);
