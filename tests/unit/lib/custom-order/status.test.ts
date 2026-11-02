import { CustomOrderStatus } from "@/generated/prisma/enums";
import {
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  canTransition,
  isTransitionAllowed,
  statusToProgress,
  type TransitionGateContext,
} from "@/lib/custom-order/status";

const ALL = Object.values(CustomOrderStatus);

/** Edges from PRD US-C1, written out independently of the implementation. */
const EXPECTED_EDGES = new Set<string>([
  "REQUEST_RECEIVED>CONSULTATION_PENDING",
  "CONSULTATION_PENDING>MEASUREMENTS_TAKEN",
  "MEASUREMENTS_TAKEN>AWAITING_DEPOSIT",
  "AWAITING_DEPOSIT>IN_PRODUCTION",
  "IN_PRODUCTION>FITTING",
  "FITTING>READY",
  "READY>COMPLETED",
  "FITTING>IN_PRODUCTION",
  "REQUEST_RECEIVED>CANCELLED",
  "CONSULTATION_PENDING>CANCELLED",
  "MEASUREMENTS_TAKEN>CANCELLED",
  "AWAITING_DEPOSIT>CANCELLED",
]);

/** Context in which every gate is satisfied. */
const ALL_GATES_OK: TransitionGateContext = {
  quotedPriceKobo: 25_000_000,
  depositKobo: 12_500_000,
  hasSuccessfulDeposit: true,
  balanceDueKobo: 0,
};

/** Context in which every gate fails. */
const ALL_GATES_FAIL: TransitionGateContext = {
  quotedPriceKobo: null,
  depositKobo: null,
  hasSuccessfulDeposit: false,
  balanceDueKobo: 12_500_000,
};

const GATED: Partial<Record<CustomOrderStatus, string>> = {
  AWAITING_DEPOSIT: "QUOTE_MISSING",
  IN_PRODUCTION: "DEPOSIT_NOT_PAID",
  COMPLETED: "BALANCE_DUE",
};

describe("ALLOWED_TRANSITIONS", () => {
  it("defines an entry for every status", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it("matches the PRD pipeline diagram exactly", () => {
    const actual = new Set(
      Object.entries(ALLOWED_TRANSITIONS).flatMap(([from, tos]) =>
        tos.map((to) => `${from}>${to}`),
      ),
    );
    expect(actual).toEqual(EXPECTED_EDGES);
  });

  it("terminal statuses have no outgoing transitions", () => {
    expect(TERMINAL_STATUSES).toEqual(["COMPLETED", "CANCELLED"]);
    for (const s of TERMINAL_STATUSES) expect(ALLOWED_TRANSITIONS[s]).toHaveLength(0);
  });

  it("cannot cancel from IN_PRODUCTION onwards", () => {
    for (const s of ["IN_PRODUCTION", "FITTING", "READY", "COMPLETED"] as const) {
      expect(isTransitionAllowed(s, "CANCELLED")).toBe(false);
    }
  });
});

describe("canTransition — every from×to pair", () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it.each(pairs)("%s → %s (gates satisfied)", (from, to) => {
    const result = canTransition(from, to, ALL_GATES_OK);
    if (from === to) {
      expect(result).toMatchObject({ ok: false, code: "SAME_STATUS" });
    } else if (EXPECTED_EDGES.has(`${from}>${to}`)) {
      expect(result).toEqual({ ok: true });
    } else {
      expect(result).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    }
  });

  it.each(pairs)("%s → %s (gates unsatisfied)", (from, to) => {
    const result = canTransition(from, to, ALL_GATES_FAIL);
    if (from === to) {
      expect(result).toMatchObject({ ok: false, code: "SAME_STATUS" });
    } else if (!EXPECTED_EDGES.has(`${from}>${to}`)) {
      expect(result).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    } else if (GATED[to]) {
      expect(result).toMatchObject({ ok: false, code: GATED[to] });
    } else {
      expect(result).toEqual({ ok: true });
    }
  });
});

describe("canTransition — gate details", () => {
  it("→ AWAITING_DEPOSIT needs both quote and deposit", () => {
    const base = { ...ALL_GATES_OK };
    expect(
      canTransition("MEASUREMENTS_TAKEN", "AWAITING_DEPOSIT", { ...base, depositKobo: null }),
    ).toMatchObject({ ok: false, code: "QUOTE_MISSING" });
    expect(
      canTransition("MEASUREMENTS_TAKEN", "AWAITING_DEPOSIT", {
        ...base,
        quotedPriceKobo: null,
      }),
    ).toMatchObject({ ok: false, code: "QUOTE_MISSING" });
    // A zero amount is "set", not missing.
    expect(
      canTransition("MEASUREMENTS_TAKEN", "AWAITING_DEPOSIT", { ...base, depositKobo: 0 }),
    ).toEqual({ ok: true });
  });

  it("→ IN_PRODUCTION needs a deposit for both entry edges", () => {
    const noDeposit = { ...ALL_GATES_OK, hasSuccessfulDeposit: false };
    expect(canTransition("AWAITING_DEPOSIT", "IN_PRODUCTION", noDeposit)).toMatchObject({
      ok: false,
      code: "DEPOSIT_NOT_PAID",
      message: "Deposit not yet paid.",
    });
    expect(canTransition("FITTING", "IN_PRODUCTION", noDeposit)).toMatchObject({
      ok: false,
      code: "DEPOSIT_NOT_PAID",
    });
  });

  it("→ COMPLETED needs zero balance (overpayment allowed)", () => {
    expect(
      canTransition("READY", "COMPLETED", { ...ALL_GATES_OK, balanceDueKobo: 1 }),
    ).toMatchObject({ ok: false, code: "BALANCE_DUE" });
    expect(canTransition("READY", "COMPLETED", { ...ALL_GATES_OK, balanceDueKobo: -100 })).toEqual({
      ok: true,
    });
  });

  it("cancellation is never gated", () => {
    expect(canTransition("AWAITING_DEPOSIT", "CANCELLED", ALL_GATES_FAIL)).toEqual({
      ok: true,
    });
  });

  it("uses human-readable labels in NOT_ALLOWED messages", () => {
    const result = canTransition("COMPLETED", "READY", ALL_GATES_OK);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Completed");
  });
});

describe("statusToProgress (US-D1)", () => {
  const EXPECTED: Record<CustomOrderStatus, number | null> = {
    REQUEST_RECEIVED: 5,
    CONSULTATION_PENDING: 15,
    MEASUREMENTS_TAKEN: 30,
    AWAITING_DEPOSIT: 40,
    IN_PRODUCTION: 55,
    FITTING: 80,
    READY: 95,
    COMPLETED: 100,
    CANCELLED: null,
  };

  // Fails if a new enum value is added without a mapping here and in the implementation.
  it.each(ALL)("%s has the PRD mapping", (status) => {
    expect(EXPECTED).toHaveProperty(status);
    expect(statusToProgress(status)).toBe(EXPECTED[status]);
  });

  it("is monotonic along the happy path", () => {
    const happy = [
      "REQUEST_RECEIVED",
      "CONSULTATION_PENDING",
      "MEASUREMENTS_TAKEN",
      "AWAITING_DEPOSIT",
      "IN_PRODUCTION",
      "FITTING",
      "READY",
      "COMPLETED",
    ] as const;
    const values = happy.map((s) => statusToProgress(s) ?? -1);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it("every status has a label", () => {
    for (const s of ALL) expect(STATUS_LABELS[s]).toEqual(expect.any(String));
  });
});
