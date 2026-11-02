// Load .env for local runs; CI provides real env vars.
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Integration tests need DATABASE_URL (a disposable Postgres with migrations applied).",
  );
}
