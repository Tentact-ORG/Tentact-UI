# Authentication & Initial Administrator Bootstrap

This document details the security principles, password hashing standards, role-based authorization rules, and the initial administrator bootstrap mechanism for the LeadGen AI Platform.

---

## 1. Zero Default Password Principle

To comply with high-assurance security standards:
- **No hardcoded default administrator credentials** exist in the codebase.
- **No public self-service administrator registration** endpoint is permitted.
- Initial bootstrapping can only be executed when zero administrator accounts exist in the application database.

---

## 2. Administrator Bootstrap Procedure

There are two secure ways to bootstrap the primary administrator:

### Method A: Command-Line Interface (Recommended)

Run the bootstrap CLI script:

```bash
npm run bootstrap-admin -- \
  --email admin@yourcompany.com \
  --password "EnterSecurePasswordHere!" \
  --name "LeadGen Admin" \
  --org-name "Acme Corp" \
  --org-slug "acme-corp"
```

If you omit the `--password` flag, the CLI securely prompts with hidden password input and confirmation.

### Method B: Web UI Setup Wizard

1. Start both the backend and frontend servers.
2. Navigate to `http://localhost:3000`.
3. If no administrator account exists, the interface displays the **Bootstrap Initial Administrator** wizard.
4. Fill in the administrator full name, email, password, and primary organization name.
5. Upon successful creation, the wizard permanently closes, and subsequent bootstrap attempts return `403 Forbidden ("Application is already bootstrapped")`.

---

## 3. Password Hashing & Token Standards

### Argon2id Password Hashing
All local passwords are automatically hashed with **Argon2id** (`@node-rs/argon2`, using the same parameters as the original Python `argon2-cffi` service, so existing hashes remain valid). Argon2id is the winner of the Password Hashing Competition and provides state-of-the-art resistance against GPU/ASIC cracking and side-channel attacks.

### Signed JWT Tokens
Upon authentication, the API issues a signed JSON Web Token (JWT) with:
- `sub`: Internal User ID
- `org_id`: Tenant Organization ID (used to enforce tenant boundaries)
- `role`: User Role (`ADMIN`, `MEMBER`, or `AUDITOR`)
- `exp`: Configurable expiration timestamp (default: 8 hours)
- `iat`: Issuance timestamp

---

## 4. Role-Based Access Control (RBAC)

| Role | Permissions & Capabilities |
| :--- | :--- |
| **`ADMIN`** | Full permissions: execute all searches, view AI SQL diagnostics & reviewer reasoning, access the Admin Console, approve/reject table relationships, manage column sensitivity, invite/manage users, view full audit logs. |
| **`AUDITOR`** | Read-only access to the Admin Console: inspect discovered schema metadata, view approved joins, inspect audit event logs, and review system metrics. Cannot mutate user accounts or approve relationships. |
| **`MEMBER`** | Standard search workspace access: execute natural language searches, apply structured ICP filters, save search templates, run CSV exports. Cannot access restricted columns or inspect raw SQL diagnostics. |

---

## 5. Account Recovery Procedure

If an administrator forgets their password, it can be reset from the project root with a local one-off command (it reads `DATABASE_URL` from `.env`):

```bash
node --env-file-if-exists=.env --import tsx --input-type=module -e "
const { getDb, closeDb } = await import('./src/server/core/database.ts');
const { hashPassword } = await import('./src/server/core/security.ts');
const res = await getDb().updateTable('users')
  .set({ hashed_password: await hashPassword('NewSecurePassword123!') })
  .where('email', '=', 'admin@yourcompany.com').executeTakeFirst();
console.log(Number(res.numUpdatedRows) === 1 ? 'Password successfully reset.' : 'No user with that email.');
await closeDb();
"
```
