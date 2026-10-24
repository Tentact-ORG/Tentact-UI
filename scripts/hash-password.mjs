#!/usr/bin/env node
/**
 * Prints a password hash for TENTACT_AUTH_ACCOUNTS.
 *
 *   node scripts/hash-password.mjs              # prompts without echoing
 *   node scripts/hash-password.mjs 'secret'     # from an argument (shows up in shell history)
 *
 * Output format: pbkdf2-sha256.<iterations>.<salt base64url>.<key base64url>
 * (the same format `src/server/auth/password.ts` verifies).
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import readline from "node:readline";

const ITERATIONS = 600_000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH_BYTES);
  const key = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH_BYTES, "sha256");
  return ["pbkdf2-sha256", ITERATIONS, salt.toString("base64url"), key.toString("base64url")].join(".");
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (text) => {
      // Echo the prompt itself but not the characters typed after it.
      if (text.startsWith(question)) write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = process.argv[2] ?? (await promptHidden("Password: "));
if (!password) {
  console.error("A password is required.");
  process.exit(1);
}
console.log(hashPassword(password));
