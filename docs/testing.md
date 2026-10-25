# Automated Testing Guide

The LeadGen AI Platform includes an automated test suite (Vitest) covering unit, integration, security and end-to-end API workflows.

---

## 1. Running the Checks

```bash
npm test             # full test suite
npm run typecheck    # strict TypeScript check
npm run lint         # ESLint (next/core-web-vitals + TypeScript rules)
npm run build        # production build
```

To run a single module:

```bash
npx vitest run tests/sqlSecurity.test.ts
```

---

## 2. Test Suite Architecture

| Test File | Category | Description |
| :--- | :--- | :--- |
| `tests/auth.test.ts` | Authentication & Permissions | Login, invalid credentials, token validation, RBAC enforcement, one-time admin bootstrap, Argon2id hashes produced by the original Python service. |
| `tests/schemaDiscovery.test.ts` | Dynamic Metadata | Schema reflection, fingerprints identical to the Python implementation, drift detection and relationship invalidation, value discovery strategies, join inference. |
| `tests/sqlSecurity.test.ts` | Deterministic Security | Mutation and multi-statement rejection, system catalogs, unapproved tables and joins, restricted columns (including via `SELECT *`), dangerous (table) functions, LIMIT caps, ClickHouse syntax handling. |
| `tests/agentsAndWorkflow.test.ts` | Two-Agent Engine | SQL Generator and Reviewer, ambiguity handling, intermediate representation, bounded repair (max 2 retries), non-retried policy violations, fail-closed reviewer parsing. |
| `tests/queryExecution.test.ts` | Accurate Counts & Grain | Distinct entity counts, count-query fallback, ISO timestamp formatting, SQL sanitization. |
| `tests/csvExport.test.ts` | CSV Export & Sanitization | Async job processing, formula-injection protection, byte-for-byte parity with Python's `csv` output, tenant isolation, token downloads, expiry and cleanup. |
| `tests/adminAndAudit.test.ts` | Operations & Admin | Metadata status, auditor read-only access, relationship approvals, column policies, user management, audit logs and secret redaction. |
| `tests/e2eSearch.test.ts` | End-to-End Search | Company and contact search, admin diagnostics, 403/422/401 mapping, saved searches with org isolation, filter options, health endpoints. |
| `tests/database.test.ts` | Data Compatibility | Database URL parsing and SQLAlchemy-compatible timestamp, boolean and JSON storage formats. |

---

## 3. Test Isolation & Reproducibility

- **Database isolation**: every test file runs in its own process with a throwaway SQLite database in the OS temp directory; tables are recreated before each test.
- **Deterministic mock LLM**: tests run with `LLM_PROVIDER=mock`, so no API keys or network access are needed.
- **Offline ClickHouse**: tests run with `CLICKHOUSE_MODE=mock`, backed by `database/synthetic_seed_data.json`; failure modes are simulated with spies on the ClickHouse service.
- Real configuration in `.env` is never loaded by the test runner.
