/**
 * Grants credits to a workspace from the command line (e.g. after an invoice is paid).
 *
 * Usage: npm run grant-credits -- --org-slug enterprise-growth --credits 5000 [--note "Invoice 1042"]
 */
import { parseArgs } from "node:util";
import { closeDb, getDb, migrateDatabase } from "@/server/core/database";
import { errorMessage } from "@/server/core/errors";
import { creditService } from "@/server/services/creditService";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { "org-slug": { type: "string" }, credits: { type: "string" }, note: { type: "string" } } });
  const credits = Number(values.credits);
  if (!values["org-slug"] || !Number.isSafeInteger(credits) || credits <= 0) {
    console.error("Usage: npm run grant-credits -- --org-slug <slug> --credits <positive integer> [--note <text>]");
    return 1;
  }
  await migrateDatabase();
  const org = await getDb().selectFrom("organizations").select(["id", "name"]).where("slug", "=", values["org-slug"]).executeTakeFirst();
  if (!org) {
    console.error(`No workspace with slug '${values["org-slug"]}'.`);
    return 1;
  }
  const balance = await creditService.grant(org.id, credits, null, values.note ? `cli: ${values.note}` : "cli grant");
  console.log(`Granted ${credits.toLocaleString("en-US")} credits to ${org.name}. Balance: ${balance.toLocaleString("en-US")}.`);
  return 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(`ERROR: ${errorMessage(err)}`);
    await closeDb();
    process.exit(1);
  });
