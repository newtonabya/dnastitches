import { render, screen } from "@testing-library/react";

import { StatusBadge } from "@/components/shop/status-badge";

describe("<StatusBadge> (US-A1 AC2–4)", () => {
  it.each([
    ["AVAILABLE", "Available"],
    ["LOW_STOCK", "Last One"],
    ["SOLD_OUT", "1-of-1 · Sold"],
  ] as const)("%s shows the text label %p", (status, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute("data-status", status);
  });

  it("uses the brand accent for Last One", () => {
    render(<StatusBadge status="LOW_STOCK" />);
    expect(screen.getByText("Last One")).toHaveClass("bg-brand");
  });
});
