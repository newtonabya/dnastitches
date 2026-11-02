/** @jest-environment node */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { devSendVerificationRequest } from "@/lib/auth-dev-email";

const env = process.env as Record<string, string | undefined>;
const original = { NODE_ENV: env.NODE_ENV, E2E_MAGIC_LINK_FILE: env.E2E_MAGIC_LINK_FILE };

afterEach(() => {
  env.NODE_ENV = original.NODE_ENV;
  env.E2E_MAGIC_LINK_FILE = original.E2E_MAGIC_LINK_FILE;
  jest.restoreAllMocks();
});

describe("devSendVerificationRequest", () => {
  it("logs the link and appends it to E2E_MAGIC_LINK_FILE, creating the folder", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dna-magic-"));
    const file = path.join(dir, "nested", "links.jsonl");
    env.E2E_MAGIC_LINK_FILE = file;
    const info = jest.spyOn(console, "info").mockImplementation(() => {});

    await devSendVerificationRequest({ identifier: "a@example.com", url: "http://localhost/x" });
    await devSendVerificationRequest({ identifier: "b@example.com", url: "http://localhost/y" });

    expect(info.mock.calls[0]![0]).toContain("http://localhost/x");
    expect(
      (await readFile(file, "utf8"))
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l)),
    ).toEqual([
      { identifier: "a@example.com", url: "http://localhost/x" },
      { identifier: "b@example.com", url: "http://localhost/y" },
    ]);
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses to run in production", async () => {
    env.NODE_ENV = "production";
    await expect(
      devSendVerificationRequest({ identifier: "a@example.com", url: "x" }),
    ).rejects.toThrow(/AUTH_RESEND_KEY/);
  });
});
