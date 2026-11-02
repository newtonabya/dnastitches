import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PipelineBoard } from "@/components/admin/pipeline-board";
import type { updateCustomOrderStatus } from "@/server/actions/admin/orders";
import { PIPELINE_STATUSES, type PipelineCard } from "@/server/data/admin/orders";

type Action = typeof updateCustomOrderStatus;

const card = (overrides: Partial<PipelineCard>): PipelineCard => ({
  id: "o1",
  reference: "DNA-2026-0001",
  title: "Green gown",
  status: "REQUEST_RECEIVED",
  customerName: "Ada",
  customerEmail: "ada@example.com",
  updatedAt: new Date("2026-11-01T10:00:00Z"),
  targetDate: null,
  source: "product",
  ...overrides,
});

describe("<PipelineBoard> (US-C1)", () => {
  it("renders one column per non-terminal status with its cards", () => {
    render(
      <PipelineBoard
        cards={[card({}), card({ id: "o2", reference: "DNA-2026-0002", status: "FITTING" })]}
        columns={PIPELINE_STATUSES}
        action={jest.fn() as unknown as Action}
      />,
    );
    expect(screen.getAllByRole("region")).toHaveLength(7);
    expect(
      within(screen.getByTestId("column-REQUEST_RECEIVED")).getByText("DNA-2026-0001"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("column-FITTING")).getByText("DNA-2026-0002"),
    ).toBeInTheDocument();
    // Cards offer only the allowed next statuses.
    const select = within(screen.getByTestId("column-FITTING")).getByRole("combobox");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Move to…", "Ready", "In production"]);
    // The drag handle is keyboard reachable.
    expect(
      screen.getByRole("button", { name: "Drag DNA-2026-0001 to another column" }),
    ).toBeInTheDocument();
  });

  it("sends orderId, target and the status it saw, and confirms the move", async () => {
    const action = jest.fn(async () => ({ ok: true as const, message: "ok" }));
    const user = userEvent.setup();
    render(
      <PipelineBoard
        cards={[card({})]}
        columns={PIPELINE_STATUSES}
        action={action as unknown as Action}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Move DNA-2026-0001 to/ }),
      "CONSULTATION_PENDING",
    );

    const fd = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(fd)).toEqual({
      orderId: "o1",
      to: "CONSULTATION_PENDING",
      expectedFrom: "REQUEST_RECEIVED",
    });
    expect(
      await screen.findByText("DNA-2026-0001 moved to Consultation pending."),
    ).toBeInTheDocument();
  });

  it("snaps the card back and shows the server's reason when a move is rejected (AC3, AC8)", async () => {
    let resolve: (v: { ok: false; formError: string }) => void = () => {};
    const action = jest.fn(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(
      <PipelineBoard
        cards={[card({ status: "AWAITING_DEPOSIT" })]}
        columns={PIPELINE_STATUSES}
        action={action as unknown as Action}
      />,
    );
    await user.selectOptions(screen.getByRole("combobox"), "IN_PRODUCTION");

    // Optimistic: the card moves immediately…
    expect(
      within(screen.getByTestId("column-IN_PRODUCTION")).getByText("DNA-2026-0001"),
    ).toBeInTheDocument();
    resolve({ ok: false, formError: "Deposit not yet paid." });

    // …then rolls back with the reason.
    expect(await screen.findByText("DNA-2026-0001: Deposit not yet paid.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByTestId("column-AWAITING_DEPOSIT")).getByText("DNA-2026-0001"),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("column-IN_PRODUCTION")).queryByText("DNA-2026-0001"),
    ).not.toBeInTheDocument();
  });
});
