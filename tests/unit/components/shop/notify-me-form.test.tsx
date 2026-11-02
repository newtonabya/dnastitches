import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NotifyMeForm } from "@/components/shop/notify-me-form";
import type { createNotificationRequest } from "@/server/actions/notification-request";

type Action = typeof createNotificationRequest;

describe("<NotifyMeForm> (US-D2)", () => {
  it("pre-fills the email and checks Restock by default (AC1)", () => {
    render(
      <NotifyMeForm
        productId="p1"
        defaultEmail="ada@example.com"
        action={jest.fn() as unknown as Action}
      />,
    );
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Restock / similar piece")).toBeChecked();
    expect(screen.getByLabelText("Similar fabric")).not.toBeChecked();
  });

  it("submits email, productId and the selected types, then shows the success message", async () => {
    const action = jest.fn(async () => ({ ok: true as const, message: "You're on the list." }));
    const user = userEvent.setup();
    render(<NotifyMeForm productId="p1" action={action as unknown as Action} />);

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByLabelText("Similar fabric"));
    await user.click(screen.getByRole("button", { name: "Notify me" }));

    expect(await screen.findByRole("status")).toHaveTextContent("You're on the list.");
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("email")).toBe("ada@example.com");
    expect(formData.get("productId")).toBe("p1");
    expect(formData.getAll("types")).toEqual(["RESTOCK", "SIMILAR_FABRIC"]);
  });

  it("shows inline field errors and form errors from the server (AC3)", async () => {
    const action = jest.fn(async () => ({
      ok: false as const,
      fieldErrors: { email: "Enter a valid email address" },
      formError: "Too many requests.",
    }));
    const user = userEvent.setup();
    render(<NotifyMeForm productId="p1" action={action as unknown as Action} />);
    await user.click(screen.getByRole("button", { name: "Notify me" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests.");
  });
});
