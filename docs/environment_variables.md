# Environment Variables Reference

All runtime configuration is read from environment variables. Next.js loads a local `.env` file from the project root automatically; the values are validated at startup (`src/server/core/config.ts`) and the server refuses to start on invalid configuration.

> [!WARNING]
> Never commit real secrets, private tokens, database credentials, or provider API keys into source control. Always copy from `.env.example` to `.env`.

---

## Configuration Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | *(localhost)* | Absolute origin of the deployed site, for canonical URLs, Open Graph tags, sitemap and robots.txt. Must be set in production. |
| `TENTACT_AUTH_SECRET` | *(none; required)* | 32+ random characters that sign dashboard session cookies. Rotating it signs everyone out. Sign-in is unavailable until it is set. |
| `APP_ENV` | `development` | Environment mode (`development`, `test`, `production`). `production` requires a unique `JWT_SECRET_KEY` of 32+ characters; `test` disables background workers. |
| `LOG_LEVEL` | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`). |
| `PORT` | `3000` | HTTP port of the Next.js server (`next start` / standalone `server.js`). |
| `DATABASE_URL` | `sqlite+aiosqlite:///./leadgen_app.db` | Application database. SQLite: `sqlite:///./file.db` (the `+aiosqlite` form is accepted). PostgreSQL: `postgresql://user:pass@host:5432/dbname` (the `+asyncpg` form is accepted). |
| `CLICKHOUSE_MODE` | `client` | `client` for a network ClickHouse server, `mock` for the offline synthetic dataset. |
| `CLICKHOUSE_HOST` | `localhost` | ClickHouse server hostname. |
| `CLICKHOUSE_PORT` | `8123` | ClickHouse HTTP(S) interface port. |
| `CLICKHOUSE_USER` | `default` | ClickHouse username (`CLICKHOUSE_USERNAME` is accepted as an alias). |
| `CLICKHOUSE_PASSWORD` | `""` | ClickHouse password. |
| `CLICKHOUSE_DATABASE` | `leadgen_warehouse` | Database catalog to inspect and query. |
| `CLICKHOUSE_SECURE` | `false` | Use HTTPS/TLS for ClickHouse connections. |
| `CLICKHOUSE_VERIFY` | `true` | Verify the ClickHouse TLS certificate. Disable only for self-signed certificates on trusted networks. |
| `CLICKHOUSE_CONNECT_TIMEOUT_SEC` | `10` | Timeout in seconds for connectivity checks. |
| `CLICKHOUSE_QUERY_TIMEOUT_SEC` | `30` | Server-side `max_execution_time` for interactive queries (exports use 60s). |
| `JWT_SECRET_KEY` | *(development value)* | 32+ character random secret for the Bearer tokens issued to API clients by `/api/auth/login`. **Must be changed in production.** |
| `JWT_ALGORITHM` | `HS256` | `HS256`, `HS384` or `HS512`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Token lifetime (8 hours by default). |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-delimited origins allowed to call `/api/*` cross-origin. The bundled UI is same-origin and does not need this. |
| `LLM_PROVIDER` | `mock` | `mock`, `azure`, `groq`, `openai`, `anthropic` or `gemini`. |
| `LLM_MODEL` | `mock-advanced-sql` | Model name. Left at the default, each provider uses its own default model (see [LLM configuration](llm_configuration.md)). |
| `LLM_TEMPERATURE` | `0.0` | Sampling temperature for Groq, OpenAI and Gemini. Not sent to Anthropic (the Messages API no longer accepts it). |
| `LLM_TIMEOUT_SEC` | `25` | LLM request timeout in seconds. |
| `GROQ_API_KEY` | *(empty)* | Required when `LLM_PROVIDER=groq`. |
| `OPENAI_API_KEY` | *(empty)* | Required when `LLM_PROVIDER=openai`. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Optional OpenAI-compatible endpoint. |
| `ANTHROPIC_API_KEY` | *(empty)* | Required when `LLM_PROVIDER=anthropic`. |
| `GEMINI_API_KEY` | *(empty)* | Required when `LLM_PROVIDER=gemini`. |
| `AZURE_OPENAI_ENDPOINT` | *(empty)* | Azure OpenAI v1 endpoint, `https://<resource>.services.ai.azure.com/openai/v1`. Required when `LLM_PROVIDER=azure`. |
| `AZURE_OPENAI_API_KEY` | *(empty)* | Key of the Azure resource. Required when `LLM_PROVIDER=azure`; server-side only. |
| `AZURE_OPENAI_DEPLOYMENT` | *(empty)* | Deployment name (not model name). Required when `LLM_PROVIDER=azure`. |
| `AZURE_OPENAI_REASONING_EFFORT` | *(unset)* | `minimal`, `low`, `medium` or `high` for reasoning deployments (gpt-5, o-series); used by the SQL generator. |
| `AZURE_OPENAI_REVIEWER_REASONING_EFFORT` | *(generator's)* | Reasoning effort for the SQL reviewer. |
| `AZURE_OPENAI_TEMPERATURE` | *(unset)* | Sent only when set; reasoning deployments reject any value but the default. |
| `EXPORT_MAX_ROWS` | `100000` | Maximum row cap for CSV export jobs. |
| `EXPORT_EXPIRATION_HOURS` | `24` | Retention period before export files are deleted. |
| `EXPORT_STORAGE_PATH` | `./exports_storage` | Private directory for generated CSV files (files are created with mode `0600`). |
| `NEXT_PUBLIC_API_URL` | *(empty = same origin)* | Optional API origin for the browser UI. Inlined at build time. |
| `NEXT_OUTPUT` | *(unset)* | Set to `standalone` at build time to produce the self-contained server used by the Docker image. |
