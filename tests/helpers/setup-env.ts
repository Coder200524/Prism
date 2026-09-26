import { execSync } from "node:child_process";

process.env.NODE_ENV = "test";
process.env.PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:8080";
process.env.SEED_DEMO = process.env.SEED_DEMO ?? "false";

const defaultTestDb = "postgresql://postgres:postgres@127.0.0.1:5433/dogfood_test";
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? defaultTestDb;

if (process.env.VITEST_POOL_ID) {
  const schema = `test_${process.env.VITEST_POOL_ID}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  for (let i = 0; i < 3; i++) {
    try {
      execSync("npx prisma db push --schema=src/server/prisma/schema.prisma --skip-generate", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url.toString() } });
      break;
    } catch (e) {
      if (i === 2) throw e;
      execSync(`node -e "setTimeout(()=>{}, ${Math.floor(Math.random() * 1000) + 500})"`);
    }
  }
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
