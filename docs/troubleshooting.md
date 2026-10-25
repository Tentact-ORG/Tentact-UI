# Troubleshooting & Operational Guide

This document lists common operational issues, diagnostics, and recovery steps.

---

## 1. ClickHouse Connectivity Issues

### Error: `Code: 516. DB::Exception: default: Authentication failed`
**Cause**: The password specified in `.env` (`CLICKHOUSE_PASSWORD`) does not match the ClickHouse server configuration.  
**Resolution**:
1. Check whether your ClickHouse instance requires a password. In the provided Docker container, the default password is `clickhouse_pass`.
2. Update `.env`:
   ```bash
   CLICKHOUSE_PASSWORD=clickhouse_pass
   ```
3. Test connectivity directly over the ClickHouse HTTP interface:
   ```bash
   curl -u default:clickhouse_pass 'http://localhost:8123/?query=SELECT%201'
   ```

### Error: `Connection refused on port 8123`
**Cause**: The ClickHouse service is not running or port 8123 is not bound.  
**Resolution**:
1. Check container status:
   ```bash
   docker ps | grep clickhouse
   ```
2. If stopped, start the container:
   ```bash
   docker compose up -d clickhouse
   ```

---

## 2. Query Execution & Validation Failures

### Error: `Query rejected by security review: Query references unapproved table`
**Cause**: The generated query references a table (such as `synthetic_raw_events`) that has not been approved in the schema registry.  
**Resolution**:
1. Log in as an Administrator.
2. Go to the **Admin Console** -> **Schema Discovery & Health** or **Relationship Approvals**.
3. Verify which tables are intended for production queries. Unapproved tables are intentionally blocked from LLM execution to prevent data leakage.

### Error: `Deterministic policy violation: Access denied: Column '...' is classified as RESTRICTED`
**Cause**: A regular `MEMBER` user attempted to select or filter on a column classified as `RESTRICTED` (such as `confidential_arr` or `direct_phone`).  
**Resolution**:
- If the column should be visible to regular team members, an Administrator can navigate to **Admin Console** -> **Column Policies & Permissions** and change its classification to `Public`.

---

## 3. CSV Export Downloads

### Error: `HTTP 410 Gone: Export file has expired`
**Cause**: Generated CSV files are retained only for `EXPORT_EXPIRATION_HOURS` (default: 24 hours).  
**Resolution**:
- Rerun the export from the workspace table to generate a fresh export file.
- Administrators can increase the retention window in `.env`:
  ```bash
  EXPORT_EXPIRATION_HOURS=72
  ```

---

## 4. Health Check Status Degraded

Navigate to `http://localhost:3000/api/health/ready` to view the component status breakdown:
```json
{
  "status": "ready",
  "components": {
    "app_database": "connected",
    "clickhouse": "connected",
    "schema_metadata": "ready",
    "value_discovery": "ready"
  },
  "fingerprint": "0bd0a4e2...",
  "search_capable": true
}
```
If any component reports `unavailable` or `initializing`, check the server logs:
```bash
# View backend application logs
tail -f backend.log
```
