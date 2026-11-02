import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ADVISE_ME_LABEL, SwatchGrid } from "@/components/custom/swatch-grid";

const swatches = [
  {
    id: "s1",
    name: "Indigo Adire",
    colorHex: "#2E3A87",
    imageUrl: "https://placehold.co/1.png",
    composition: "Cotton",
  },
  {
    id: "s2",
    name: "Gold Aso-Oke",
    colorHex: "#C9A227",
    imageUrl: "https://placehold.co/2.png",
    composition: "Cotton & lurex",
  },
];

function Harness({ initial }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null | undefined>(initial);
  return <SwatchGrid swatches={swatches} value={value} onChange={setValue} />;
}

describe("<SwatchGrid> (US-B1 DoD)", () => {
  it("renders a radio group with every swatch plus 'advise me'", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Indigo Adire"),
      expect.stringContaining("Gold Aso-Oke"),
      expect.stringContaining(ADVISE_ME_LABEL),
    ]);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    // Roving tabindex: exactly one radio is in the tab order.
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it("arrow keys move focus (wrapping), Enter and Space select, and the choice is announced", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole("radio", { name: /Indigo Adire/ })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Gold Aso-Oke/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("radio", { name: /Gold Aso-Oke/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("Selected: Gold Aso-Oke")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Indigo Adire/ })).toHaveFocus();
    await user.keyboard("{End} ");
    expect(screen.getByRole("radio", { name: new RegExp(ADVISE_ME_LABEL) })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(`Selected: ${ADVISE_ME_LABEL}`)).toBeInTheDocument();

    await user.keyboard("{Home}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: new RegExp(ADVISE_ME_LABEL) })).toHaveFocus();
  });

  it("clicking selects; the selected swatch is the tab stop", async () => {
    const user = userEvent.setup();
    render(<Harness initial="s2" />);
    expect(screen.getByRole("radio", { name: /Gold Aso-Oke/ })).toHaveAttribute("tabindex", "0");
    await user.click(screen.getByRole("radio", { name: /Indigo Adire/ }));
    expect(screen.getByRole("radio", { name: /Indigo Adire/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
