import { getSettings } from "./core/config";
import { closeDb, migrateDatabase } from "./core/database";
import { errorMessage } from "./core/errors";
import { getLogger } from "./core/logger";
import { singleton } from "./core/singleton";
import { chService } from "./services/clickhouseClient";
import { exportService } from "./services/exportService";
import { relationshipService } from "./services/relationshipDiscovery";
import { schemaDiscoveryService } from "./services/schemaDiscovery";
import { valueDiscoveryService } from "./services/valueDiscovery";

const logger = getLogger("leadgen.app");

const EXPORT_CLEANUP_INTERVAL_MS = 3600_000;

interface AppState {
  init: Promise<void> | null;
  database: Promise<void> | null;
  timers: NodeJS.Timeout[];
}

const state = singleton<AppState>("appState", () => ({ init: null, database: null, timers: [] }));

/**
 * Creates the application tables once per process. Pages that only need the
 * application database (sign-in, session checks) await this instead of the full
 * startup, which also waits for ClickHouse schema discovery.
 */
export function ensureDatabaseReady(): Promise<void> {
  if (state.database === null) {
    state.database = migrateDatabase().catch((err: unknown) => {
      state.database = null;
      throw err;
    });
  }
  return state.database;
}

async function backgroundValueDiscovery(): Promise<void> {
  // Values change slowly; re-scanning hundreds of columns on every start (serverless hosts start
  // often) would load the warehouse for nothing. `npm run discover-warehouse` refreshes them too.
  const maxAgeHours = getSettings().VALUE_DISCOVERY_MAX_AGE_HOURS;
  if (await valueDiscoveryService.isFresh(maxAgeHours)) {
    logger.info(`Distinct values were refreshed within ${maxAgeHours} h; skipping background value discovery.`);
    return;
  }
  logger.info("Starting background distinct-value discovery task...");
  try {
    const count = await valueDiscoveryService.refreshAllValues();
    logger.info(`Background value discovery completed for ${count} columns.`);
  } catch (err) {
    logger.error(`Background value discovery encountered an error: ${errorMessage(err)}`);
  }
}

async function backgroundExportCleanup(): Promise<void> {
  try {
    const cleaned = await exportService.cleanupExpiredExports();
    if (cleaned > 0) logger.info(`Cleaned up ${cleaned} expired export files.`);
  } catch (err) {
    logger.warn(`Error in export cleanup loop: ${errorMessage(err)}`);
  }
}

async function initialize(): Promise<void> {
  const settings = getSettings();
  logger.info(`Initializing LeadGen AI Platform (env: ${settings.APP_ENV})...`);

  // 1. Application database tables
  await ensureDatabaseReady();

  // 2. Discover the ClickHouse schema and relationships before serving searches.
  await schemaDiscoveryService.loadSchemaCache();
  await relationshipService.loadApprovedRelationships();
  await valueDiscoveryService.loadValueCache();
  if (await chService.isConnected()) {
    logger.info("ClickHouse instance detected. Discovering schema...");
    try {
      const schema = await schemaDiscoveryService.discoverClickhouseSchema();
      // Candidate joins only change with the schema; skip the scan (and its writes) otherwise.
      if (!schema.unchanged) await relationshipService.discoverCandidateRelationships();
      await valueDiscoveryService.loadValueCache();
    } catch (err) {
      logger.error(`Error during initial ClickHouse schema discovery: ${errorMessage(err)}`);
    }
  } else {
    logger.warn("ClickHouse instance is not currently connected. Schema discovery deferred.");
  }

  // 3. Background workers
  if (settings.backgroundTasksEnabled) {
    const valueTimer = setTimeout(() => void backgroundValueDiscovery(), 1000);
    const cleanupTimer = setInterval(() => void backgroundExportCleanup(), EXPORT_CLEANUP_INTERVAL_MS);
    valueTimer.unref();
    cleanupTimer.unref();
    state.timers.push(valueTimer, cleanupTimer);
  }
}

/**
 * Runs application startup exactly once per process (equivalent of the FastAPI lifespan).
 * Kicked off by `instrumentation.ts` and awaited by every API route; a failed start is
 * retried on the next request.
 */
export function ensureAppInitialized(): Promise<void> {
  if (state.init === null) {
    state.init = initialize().catch((err: unknown) => {
      state.init = null;
      throw err;
    });
  }
  return state.init;
}

export async function shutdownApp(): Promise<void> {
  for (const timer of state.timers) clearTimeout(timer);
  state.timers = [];
  await exportService.drain();
  await chService.close();
  await closeDb();
  state.init = null;
  state.database = null;
  logger.info("LeadGen AI Platform shut down gracefully.");
}
