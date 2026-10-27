import "./_env";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../src/db/client";
import { createOrPromoteAdmin, generatePassword } from "../src/features/admin-users/create-admin";

/**
 * `pnpm admin:create --email owner@agency.com [--name "Owner"] [--password ...]`
 * Creates the first admin (or promotes an existing user). Without --password a strong one is
 * generated and printed once. The admin sets up two-step verification at first sign-in.
 */
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
    "read-only": { type: "boolean", default: false },
  },
});

if (!values.email || !values.email.includes("@")) {
  console.error(
    'Usage: pnpm admin:create --email owner@agency.com [--name "Owner"] [--password <min 10 chars>]',
  );
  process.exit(1);
}
if (values.password && values.password.length < 10) {
  console.error("The password must have at least 10 characters.");
  process.exit(1);
}

const password = values.password ?? generatePassword();
const name = values.name ?? values.email.split("@")[0]!;

try {
  const db = await getDb();
  const { created } = await createOrPromoteAdmin(db, {
    email: values.email,
    name,
    password,
    readOnly: values["read-only"],
  });
  console.log(created ? "Admin created." : "Existing user is now an admin.");
  console.log(`  Email:    ${values.email.toLowerCase()}`);
  if (!values.password) console.log(`  Password: ${password}   (shown once, store it safely)`);
  console.log(
    `  Sign in:  ${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/admin/sign-in`,
  );
} catch (err) {
  console.error("Could not create the admin:", err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
