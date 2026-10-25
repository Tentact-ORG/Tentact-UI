# Security Model & Defense-in-Depth Architecture

The LeadGen AI Platform employs a multi-tiered security model designed to treat all LLM outputs as untrusted data while enforcing multi-tenant isolation and data protection.

---

## 1. Multi-Tier Security Enforcement

```
[User Request]
       │
       ▼
[Agent 1: SQL Generator] ──> Produces Candidate SQL
       │
       ▼
[Agent 2: Independent Reviewer] ──> Rejects unapproved tables/joins, role violations
       │ (Approval Required)
       ▼
[Deterministic SQL Validator] ──> Syntactic & Policy Validation
       │ (Approval Required)
       ▼
[Controlled Query Executor] ──> Executes with readonly=1 and query timeouts
       │
       ▼
[ClickHouse Engine] (Read-Only User Account)
```

---

## 2. Deterministic AST Security Rules

Regular expressions are known to be vulnerable to obfuscation, comments, and SQL injection bypasses. Therefore, every query is tokenized (string literals, quoted identifiers, nested comments and `{name:Type}` parameters are handled explicitly) and structurally analyzed by a ClickHouse-aware analyzer (`src/server/services/clickhouseSql.ts`). Anything that cannot be tokenized or bracket-balanced is rejected as a syntax error, so unknown constructs fail closed.

The validator enforces the following rules:

1. **Strictly Read-Only Query Forms**:
   - Only `SELECT` statements (optionally with `WITH` CTEs and `UNION`) are permitted.
   - Any construct representing `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, or system commands immediately causes validation to fail.

   - Column wildcards (`SELECT *`, `t.*`) are expanded against the schema registry, so they cannot bypass column sensitivity or approval rules.

2. **Single-Statement Enforcement**:
   - Any query containing semicolons with multiple statement expressions is unconditionally rejected to prevent stacked-query injection.

3. **Table & Database Allowlists**:
   - Only tables in the configured ClickHouse database (`CLICKHOUSE_DATABASE`) that are marked `is_approved=True` in the schema registry may be queried.
   - System catalogs (`system.*`, `information_schema.*`) are explicitly forbidden.

4. **Approved Joins Only**:
   - Any `exp.Join` construct in the query is validated against the **Approved Table Relationships** registry. Unapproved joins are rejected.

5. **Role-Based Column Sensitivity**:
   - Columns classified as `RESTRICTED` (such as `confidential_arr` or `direct_phone`) require the `ADMIN` role.
   - Columns classified as `INTERNAL` require `ADMIN` or `AUDITOR` roles.
   - Regular `MEMBER` queries attempting to access restricted columns fail validation on the server.

6. **Dangerous Function Banning**:
   - Built-in functions that can read host files, call network sockets, or evaluate external code (`file()`, `url()`, `remote()`, `mysql()`, `s3()`, `sleep()`, `eval()`) are blocked.

---

## 3. Database-Level Enforcement

In addition to application-level AST validation:
- The ClickHouse connection enforces `readonly = 1` in query settings.
- The ClickHouse account is configured with read-only permissions on the lead dataset.
- Database-side query execution timeouts (`max_execution_time`) are configured on every query to prevent runaway resource consumption.

---

## 4. Formula Injection Protection (CSV Exports)

When CSV files are exported and opened in spreadsheet software (Microsoft Excel, Google Sheets, Apple Numbers), cells beginning with dangerous characters can trigger remote code execution or data exfiltration.

The export worker inspects every cell and sanitizes formula prefixes:
- Any cell beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` is automatically prepended with a single quote `'`.
- This forces spreadsheet software to treat the value strictly as text without executing it as a formula.

---

## 5. Multi-Tenant Organization Isolation

- **Lead Warehouse (ClickHouse)**: The underlying company and contact records are shared.
- **Application State (PostgreSQL / SQLite)**: User accounts, organization memberships, saved searches, export jobs, and audit events are strictly partitioned by `org_id`.
- The user's `org_id` is extracted exclusively from the verified server-side JWT claims, completely ignoring any browser-supplied organization IDs.
