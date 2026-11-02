import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SPEC_UNIT_STORAGE_KEY, SpecTable } from "@/components/shop/spec-table";
import { cmToIn } from "@/lib/units";

const measurements = { bust: 88, waist: 70.5, hips: 96, length: null };

beforeEach(() => window.sessionStorage.clear());

describe("<SpecTable> (US-A2)", () => {
  it("shows Bust, Waist, Hips, Length in cm by default, with size label and — for missing", () => {
    render(<SpecTable measurements={measurements} sizeLabel="UK 10" />);
    expect(screen.getByRole("row", { name: /Size UK 10/ })).toBeInTheDocument();
    expect(screen.getByTestId("spec-bust")).toHaveTextContent("88.0 cm");
    expect(screen.getByTestId("spec-waist")).toHaveTextContent("70.5 cm");
    expect(screen.getByTestId("spec-hips")).toHaveTextContent("96.0 cm");
    expect(screen.getByTestId("spec-length")).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: "cm" })).toHaveAttribute("aria-pressed", "true");
  });

  it("converts to inches within ±0.1 and persists the choice for the session (AC2)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SpecTable measurements={measurements} />);
    await user.click(screen.getByRole("button", { name: "in" }));

    expect(screen.getByRole("button", { name: "in" })).toHaveAttribute("aria-pressed", "true");
    for (const key of ["bust", "waist", "hips"] as const) {
      const shown = parseFloat(screen.getByTestId(`spec-${key}`).textContent ?? "");
      expect(Math.abs(shown - cmToIn(measurements[key]))).toBeLessThanOrEqual(0.1);
      expect(screen.getByTestId(`spec-${key}`)).toHaveTextContent(/ in$/);
    }
    expect(window.sessionStorage.getItem(SPEC_UNIT_STORAGE_KEY)).toBe("IN");

    unmount();
    render(<SpecTable measurements={measurements} />);
    expect(screen.getByTestId("spec-bust")).toHaveTextContent("34.6 in");
  });

  it("omits the size row when there is no size label", () => {
    render(<SpecTable measurements={measurements} />);
    expect(screen.queryByRole("row", { name: /Size/ })).not.toBeInTheDocument();
  });
});
