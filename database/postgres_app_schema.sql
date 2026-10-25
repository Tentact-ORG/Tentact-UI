-- LeadGen AI Platform - PostgreSQL Application Database Schema
-- Multi-tenant application database for users, organizations, metadata cache,
-- approved relationships, saved searches, export jobs, and audit events.

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'MEMBER' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS discovered_schemas (
    id SERIAL PRIMARY KEY,
    database_name VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    data_type VARCHAR(100) NOT NULL,
    is_nullable BOOLEAN DEFAULT FALSE NOT NULL,
    is_primary_key BOOLEAN DEFAULT FALSE NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE NOT NULL,
    sensitivity VARCHAR(50) DEFAULT 'public' NOT NULL,
    allowed_operations JSONB NOT NULL DEFAULT '["select", "filter", "sort", "group"]'::jsonb,
    discovery_status VARCHAR(50) DEFAULT 'ready' NOT NULL,
    strategy VARCHAR(50) DEFAULT 'auto' NOT NULL,
    last_refreshed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_fingerprints (
    id SERIAL PRIMARY KEY,
    database_name VARCHAR(100) NOT NULL,
    fingerprint_hash VARCHAR(64) NOT NULL,
    table_count INTEGER NOT NULL,
    column_count INTEGER NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    status VARCHAR(50) DEFAULT 'active' NOT NULL
);

CREATE TABLE IF NOT EXISTS discovered_values (
    id SERIAL PRIMARY KEY,
    database_name VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    completeness VARCHAR(50) DEFAULT 'complete' NOT NULL,
    cached_values JSONB NOT NULL,
    exact_count INTEGER DEFAULT 0 NOT NULL,
    is_exact BOOLEAN DEFAULT TRUE NOT NULL,
    last_refreshed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS table_relationships (
    id SERIAL PRIMARY KEY,
    source_table VARCHAR(100) NOT NULL,
    source_column VARCHAR(100) NOT NULL,
    target_table VARCHAR(100) NOT NULL,
    target_column VARCHAR(100) NOT NULL,
    cardinality VARCHAR(50) DEFAULT 'many_to_one' NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    confidence_score FLOAT DEFAULT 1.0 NOT NULL,
    evidence TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS saved_searches (
    id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    natural_query TEXT,
    structured_icp JSONB NOT NULL,
    intermediate_rep JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
    id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'QUEUED' NOT NULL,
    search_target VARCHAR(50) NOT NULL,
    total_rows INTEGER DEFAULT 0 NOT NULL,
    file_path VARCHAR(500),
    download_token VARCHAR(100) UNIQUE,
    error_message TEXT,
    query_snapshot JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY,
    org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    duration_ms INTEGER DEFAULT 0 NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for performance and multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_discovered_schemas_lookup ON discovered_schemas(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_discovered_values_lookup ON discovered_values(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_relationships_status ON table_relationships(status);
CREATE INDEX IF NOT EXISTS idx_saved_searches_org ON saved_searches(org_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_org ON export_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org ON audit_events(org_id);
