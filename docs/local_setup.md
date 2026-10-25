# Local Development Setup Guide

The Tentact is a single Next.js application: the landing page, the dashboard and the workspace API (`/api/*`) are served by the same Node.js process.

---

## Prerequisites

- **Node.js**: 22 or newer (required by the native SQLite driver)
- **ClickHouse**: local binary or the provided Docker container (or `CLICKHOUSE_MODE=mock` for offline work)
- **PostgreSQL**: optional; SQLite is used by default for local development

---

## Option 1: Native Local Development

### Step 1: Install dependencies and configure

```bash
npm install
cp .env.example .env   # then set TENTACT_AUTH_SECRET and JWT_SECRET_KEY (openssl rand -base64 48)
```

For a fully offline setup, set `CLICKHOUSE_MODE=mock` and `LLM_PROVIDER=mock` in `.env` and skip to Step 4.

### Step 2: Start ClickHouse

```bash
docker run -d \
  --name leadgen-clickhouse \
  -p 8123:8123 \
  -p 9000:9000 \
  -e CLICKHOUSE_DB=leadgen_warehouse \
  -e CLICKHOUSE_USER=default \
  -e CLICKHOUSE_PASSWORD=clickhouse_pass \
  clickhouse/clickhouse-server:24.3-alpine
```

### Step 3: Seed the synthetic lead dataset

```bash
CLICKHOUSE_PASSWORD=clickhouse_pass npm run seed-clickhouse
```

Expected output:
```text
Verification successful: 250 companies, 1011 contacts, 128 raw events in ClickHouse.
```

The dataset in `database/synthetic_seed_data.json` can be regenerated reproducibly with `npm run generate-data`.

### Step 4: Bootstrap the initial administrator

```bash
npm run bootstrap-admin -- \
  --email admin@enterprise.com \
  --name "Alice Administrator" \
  --org-name "Enterprise Growth Corp" \
  --org-slug "enterprise-growth"
```

The password is prompted for (hidden) when `--password` is omitted. Sign in at `/login`; further users are added from the admin console (`/home/admin`).

### Step 5: Start the application

```bash
npm run dev
```

- Landing page: http://localhost:3000 · sign-in: http://localhost:3000/login
- Health & readiness: http://localhost:3000/api/health/ready

For a production run: `npm run build && npm start`.

---

## Option 2: Docker Compose

```bash
docker compose up -d --build
docker compose ps
```

Services:
- **Application (UI + API)**: http://localhost:3000
- **ClickHouse HTTP**: http://localhost:8123
- **PostgreSQL**: localhost:5432

Before exposing the stack, replace `TENTACT_AUTH_SECRET` and `JWT_SECRET_KEY` in `docker-compose.yml` with unique random values. Seed ClickHouse from the host with `npm run seed-clickhouse`, and create the first administrator by running `npm run bootstrap-admin` on the host with `DATABASE_URL` pointing at the compose PostgreSQL (`postgresql://postgres:postgres_secure_pass@localhost:5432/leadgen_app`).

---

## Deployment Notes

- The application must run as a long-lived Node.js server (`next start` or the standalone `server.js` in the Docker image). CSV exports run as in-process background jobs and the export cleanup runs on an hourly timer, so serverless/edge platforms are not supported.
- **Upgrading an existing database:** the first start adds missing tables and columns. For SQLite the file is copied to `<file>.backup-<timestamp>` (online backup) before anything changes; for PostgreSQL take a `pg_dump` first. `npm run migrate-db -- --check` lists the pending changes and `npm run migrate-db` applies them ahead of a deployment.
- Startup work (table creation, ClickHouse schema discovery, background value discovery) begins when the server boots (`src/instrumentation.ts`); API requests wait for it to finish.
