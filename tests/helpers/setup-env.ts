process.env.NODE_ENV = "test";
process.env.PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:8080";
process.env.SEED_DEMO = process.env.SEED_DEMO ?? "false";

const defaultTestDb = "postgresql://postgres:postgres@127.0.0.1:5433/dogfood_test";
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? defaultTestDb;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
