import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddressForm } from "@/components/account/address-form";
import type { createAddressAction } from "@/server/actions/account";

type Action = typeof createAddressAction;

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Recipient name"), "Ada Obi");
  await user.type(screen.getByLabelText("Phone"), "0803");
  await user.type(screen.getByLabelText("Address line 1"), "12 Admiralty Way");
  await user.type(screen.getByLabelText("City / town"), "Lekki");
  await user.selectOptions(screen.getByLabelText("State"), "Lagos");
}

describe("<AddressForm>", () => {
  it("keeps the user's input and shows inline errors when the server rejects it", async () => {
    const action = jest.fn(async () => ({
      ok: false as const,
      fieldErrors: { phone: "Enter a valid Nigerian mobile number" },
    }));
    const user = userEvent.setup();
    render(<AddressForm action={action as unknown as Action} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Add address" }));

    expect(await screen.findByText("Enter a valid Nigerian mobile number")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Ada Obi");
    expect(screen.getByLabelText("State")).toHaveValue("Lagos");
  });

  it("clears the form after a successful add", async () => {
    const action = jest.fn(async () => ({ ok: true as const, message: "Address added." }));
    const user = userEvent.setup();
    render(<AddressForm action={action as unknown as Action} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Add address" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Address added.");
    expect(screen.getByLabelText("Recipient name")).toHaveValue("");
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("state")).toBe("Lagos");
  });

  it("lists all 36 states plus FCT", () => {
    render(<AddressForm action={jest.fn() as unknown as Action} />);
    // +1 for the disabled placeholder option
    expect(screen.getAllByRole("option")).toHaveLength(38);
  });
});
