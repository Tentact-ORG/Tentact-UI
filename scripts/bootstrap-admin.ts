/**
 * Admin Bootstrap CLI.
 * Creates the primary organization and the initial administrator account. Can only be
 * run once; fails if an administrator already exists.
 *
 * Usage: npm run bootstrap-admin -- --email admin@corp.com [--password ...] [--name ...]
 *        [--org-name ...] [--org-slug ...]   (prompts for the password if omitted)
 */
import readline from "node:readline";
import { parseArgs } from "node:util";
import { closeDb, migrateDatabase } from "@/server/core/database";
import { errorMessage } from "@/server/core/errors";
import { PASSWORD_MIN_LENGTH } from "@/server/schemas/auth";
import { adminBootstrapService } from "@/server/services/adminBootstrap";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Reads a line from the TTY without echoing it. */
function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) return prompt(question);
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("Aborted"));
          return;
        }
        value = ch === "\u007f" || ch === "\b" ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string", default: "System Administrator" },
      "org-name": { type: "string", default: "Enterprise Growth Corp" },
      "org-slug": { type: "string", default: "enterprise-growth" },
    },
  });

  await migrateDatabase();
  if (await adminBootstrapService.isAdminBootstrapped()) {
    console.error("ERROR: Application is already bootstrapped. An administrator account already exists.");
    return 1;
  }

  const email = values.email ?? (await prompt("Enter Administrator Email: "));
  let password = values.password;
  if (!password) {
    password = await promptHidden(`Enter Administrator Password (min ${PASSWORD_MIN_LENGTH} chars): `);
    const confirm = await promptHidden("Confirm Password: ");
    if (password !== confirm) {
      console.error("ERROR: Passwords do not match.");
      return 1;
    }
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    console.error(`ERROR: Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
    return 1;
  }

  try {
    const { user, organization } = await adminBootstrapService.bootstrapInitialAdmin({
      adminEmail: email,
      adminPassword: password,
      adminName: values.name!,
      orgName: values["org-name"]!,
      orgSlug: values["org-slug"]!,
    });
    console.log("\nSUCCESS! Initial Administrator Created.");
    console.log(`Organization: ${organization.name} (Slug: ${organization.slug})`);
    console.log(`Admin User:   ${user.full_name} <${user.email}>`);
    console.log("Role:         ADMIN");
    console.log("You can now log in using these credentials.");
    return 0;
  } catch (err) {
    console.error(`\nERROR: Bootstrap failed: ${errorMessage(err)}`);
    return 1;
  }
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
