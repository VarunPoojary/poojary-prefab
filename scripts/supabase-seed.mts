/*
 * Fills the Supabase database with starting data.
 *
 *   npm run db:seed -- --demo                                         all demo data + demo logins (README → Demo accounts)
 *   npm run db:seed -- --starter --username <u> --password <p>        empty database with one admin login
 *
 * Add --force to replace a database that already has data. Reads .env.local (NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). Run the SQL in supabase/migrations first.
 */
import { existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  // Imported after the env files are loaded, because the Supabase settings are read when the modules load.
  const { buildDemoData, buildStarterData } = await import("../lib/supabase/demo-data");
  const { countRecords, writeStartingData } = await import("../lib/supabase/server");
  const { validatePassword } = await import("../lib/employees/rules");

  const demo = flag("demo");
  const starter = flag("starter");
  if (demo === starter) {
    console.error("Choose one: --demo, or --starter --username <username> --password <password>.");
    process.exitCode = 1;
    return;
  }

  const existing = await countRecords();
  if (existing > 0 && !flag("force")) {
    console.error(`The database already has ${existing} records. Add --force to replace ALL of them.`);
    process.exitCode = 1;
    return;
  }

  let data;
  if (demo) {
    data = await buildDemoData();
  } else {
    const username = option("username")?.trim();
    const password = option("password");
    if (!username || !password) {
      console.error("--starter needs --username and --password.");
      process.exitCode = 1;
      return;
    }
    const issues = validatePassword(password);
    if (issues.length) {
      console.error(`Password: ${issues.join(" ")}`);
      process.exitCode = 1;
      return;
    }
    data = await buildStarterData({ username, password });
  }

  console.log(`Writing ${data.values.size} collections and ${data.logins.length} logins…`);
  await writeStartingData(data);
  console.log("Done.");
  for (const l of data.logins) console.log(`  login: ${l.username}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
