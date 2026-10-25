# Dynamic Schema Discovery & Relationship Management

The LeadGen AI Platform dynamically introspects its ClickHouse database at runtime and continuously tracks metadata freshness and schema changes.

---

## 1. Runtime ClickHouse Schema Reflection

Unlike legacy systems that rely on hardcoded table models, the **Schema Discovery Service**:
1. Connects to ClickHouse using `clickhouse-connect`.
2. Inspects `system.tables` strictly filtering by `database = '{CLICKHOUSE_DATABASE}'`.
3. Inspects `system.columns` to extract:
   - Column names and data types (e.g. `UInt64`, `LowCardinality(String)`, `Array(String)`).
   - Nullability (`Nullable(...)`).
   - Primary key membership (`is_in_primary_key`).
4. Computes a canonical SHA-256 fingerprint representing the current catalog state.
5. Persists metadata in PostgreSQL/SQLite (`discovered_schemas` and `schema_fingerprints`) to prevent expensive repeated introspection queries.

### Schema Drift & Invalidation
When ClickHouse columns or tables are added, modified, or dropped:
- The newly calculated fingerprint differs from the active record.
- The previous fingerprint is marked as `superseded`.
- Any approved relationships referencing missing or altered columns are flagged as `INVALIDATED` and require administrator review before they can be used in queries.

---

## 2. Dynamic Distinct-Value Discovery

To allow the LLM to write precise queries without hallucinating categorical values, the **Value Discovery Service** scans column values using specialized heuristics:

| Column Semantic / Type | Discovery Strategy | Completeness Status | Description |
| :--- | :--- | :--- | :--- |
| **`LowCardinality(String)` / Categorical** (Industry, Country, Department) | `categorical_enum` | `complete` or `partial` | Bounded `SELECT DISTINCT column LIMIT 501`. If count <= 500, marked `complete`; if truncated, marked `partial`. |
| **Numeric & Quantities** (Employees, Revenue, Founded Year) | `numeric_range` | `complete` | Bounded `SELECT min(col), max(col), count()`. Used to validate range filters without dropdown enumeration. |
| **Array Columns** (`Array(String)` like Technologies) | `array_enum` | `complete` or `partial` | Bounded `SELECT DISTINCT arrayJoin(col) LIMIT 501`. Populates tech stack filter pills. |
| **High-Cardinality Roles** (Job Title) | `bounded_search` | `partial` | Queries top 200 most frequent values for suggestion purposes. |
| **PII & Unique Identifiers** (Emails, Phone, URLs, IDs, Domain) | `unbounded_pii_skip` | `deferred` | Unbounded scans are bypassed to protect performance and avoid leaking personal information to LLMs. |

---

## 3. Relationship Discovery & Approval Workflow

Table joins are inferred using:
1. Matching entity ID column names (e.g. `synthetic_contacts.company_id` matches `synthetic_companies.company_id`).
2. Exact data type compatibility.
3. Target primary key metadata.

### The Inferred = Untrusted Principle
All automatically discovered relationships are inserted in `PENDING` state and **CANNOT be queried by LLM agents until approved**.

### Admin Console Interface
In the Admin Console (**Relationship Approvals** tab):
- Administrators can review the candidate tables, keys, and discovered evidence.
- Click **Approve** to authorize the join for production SQL generation.
- Click **Reject** or **Disable** to block the join.
- If an unapproved join is attempted by the generator, the Reviewer Agent and the Deterministic AST Validator reject the query before execution.

---

## The `growstack` Warehouse

When `CLICKHOUSE_DATABASE=growstack`, only these tables are approved by discovery; every other table stays unapproved until an administrator approves its columns:

| Table | Role | Notes |
| :--- | :--- | :--- |
| `new_combined_data` | Contacts (people with their company attributes) | ~375M rows, sorted by `COUNTRY_CODE_PER, EMPLOYEE_COUNT_RANGE_ORG, JOB_FUNCTION_PER, JOB_LEVEL_PER, RBID_PER`. Identifier `RBID_PER`. |
| `new_company_data` (and `new_company_data_10_26`) | Companies | Identifier `RBID_ORG`. |
| `company_data` | Company enrichment | `id` equals `RBID_ORG`. Used only inside `RBID_ORG IN (SELECT id FROM company_data WHERE …)` subqueries, never joined. `industry` (78% populated) is the most complete industry source. |

Value discovery records columns that hold no data at all. At the time of integration `company_data.technology`, `company_data.job_openings` and `company_data.last_funding_round` were empty across all 65.6M rows. The SQL generator is given that list and never filters on such columns, and the dashboard hides filters built on them, so both pick these columns up automatically once they are loaded.

### Sensitivity heuristic

Columns are classified on first discovery by name. `arr` (annual recurring revenue) only counts as a whole name token, so `confidential_arr` is RESTRICTED but `COMBINED_TECH_ARRAY_ORG` is public; values stored by earlier releases, which matched `arr` anywhere in the name, are corrected on the next discovery run. Administrators can change any column's tier in the admin console.
