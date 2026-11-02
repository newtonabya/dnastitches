import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestStepper, type RequestStepperProps } from "@/components/custom/request-stepper";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const swatches = [
  {
    id: "s1",
    name: "Indigo Adire",
    colorHex: "#2E3A87",
    imageUrl: "https://placehold.co/1.png",
    composition: "Cotton",
  },
];

function setup(overrides: Partial<RequestStepperProps> = {}) {
  const action = jest.fn(async () => ({ ok: true as const, data: { reference: "DNA-2026-0001" } }));
  const props: RequestStepperProps = {
    prefill: { referenceImageUrls: [] },
    swatches,
    profiles: [],
    addresses: [],
    userId: "u1",
    uploadsEnabled: false,
    minLeadTimeDays: 14,
    timeZone: "Africa/Lagos",
    action: action as unknown as RequestStepperProps["action"],
    ...overrides,
  };
  render(<RequestStepper {...props} />);
  return { action, user: userEvent.setup() };
}

beforeEach(() => push.mockClear());

describe("<RequestStepper> pre-fill (US-A3 AC3, US-B2 AC3)", () => {
  it("pre-fills title, reference image and fabric from the source, all still editable", async () => {
    const { user } = setup({
      prefill: {
        title: "Custom version of Adire Maxi Skirt",
        referenceImageUrls: ["https://placehold.co/p1.png"],
        fabricSwatchId: "s1",
        fromProductId: "p1",
      },
    });
    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Custom version of Adire Maxi Skirt");
    expect(screen.getByRole("img", { name: "Reference image 1" })).toBeInTheDocument();

    await user.clear(title);
    await user.type(title, "My own title");
    await user.click(screen.getByRole("button", { name: "Remove reference image 1" }));
    expect(screen.queryByRole("img", { name: "Reference image 1" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Description"), "Ankle length, please.");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("radio", { name: /Indigo Adire/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows a dismissible notice when the source wasn't found (US-B2 AC5)", async () => {
    const { user } = setup({
      prefill: { referenceImageUrls: [], notice: "We couldn't find the piece." },
    });
    expect(screen.getByText("We couldn't find the piece.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("We couldn't find the piece.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
});

describe("<RequestStepper> flow (US-B1)", () => {
  it("validates each step inline, keeps input between steps, and submits the full request", async () => {
    const { user, action } = setup();

    // Step 1: inline errors from the shared schema.
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Tell us a little more (at least 10 characters)")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Green gown");
    await user.type(screen.getByLabelText("Description"), "Floor length with long sleeves.");
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 2: a fabric choice is required.
    expect(screen.getByRole("heading", { name: "Fabric" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Choose a fabric, or "Not sure/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Not sure/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 3: new measurements with a plausibility error, then fixed.
    await user.type(screen.getByLabelText("Label"), "Me");
    await user.type(screen.getByLabelText(/Bust/), "90");
    await user.type(screen.getByLabelText(/^Waist/), "20");
    await user.type(screen.getByLabelText(/^Hips/), "98");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Waist looks unusual/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Waist/));
    await user.type(screen.getByLabelText(/^Waist/), "70");
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Back to step 1 keeps the draft (AC7).
    const review = screen.getByRole("form", { name: "Review and submit" });
    expect(within(review).getByText("Green gown")).toBeInTheDocument();
    expect(within(review).getByText("New profile: Me")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit design" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Green gown");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(screen.getByRole("button", { name: "Submit request" }));
    expect(action).toHaveBeenCalledWith({
      design: expect.objectContaining({
        title: "Green gown",
        description: "Floor length with long sleeves.",
      }),
      fabric: { fabricSwatchId: null },
      measurements: {
        mode: "new",
        profile: expect.objectContaining({ label: "Me", unit: "CM", waist: "70" }),
      },
      fulfilment: { fulfillmentMethod: "PICKUP", addressId: "" },
      source: {},
    });
    expect(push).toHaveBeenCalledWith("/custom/request/success?ref=DNA-2026-0001");
  });

  it("jumps back to the step with server-side errors", async () => {
    const action = jest.fn(async () => ({
      ok: false as const,
      fieldErrors: { "fabric.fabricSwatchId": "That fabric is no longer available." },
    }));
    const { user } = setup({
      action: action as unknown as RequestStepperProps["action"],
      prefill: { referenceImageUrls: [], fabricSwatchId: "s1" },
    });
    await user.type(screen.getByLabelText("Title"), "Gown");
    await user.type(screen.getByLabelText("Description"), "A long description here.");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /Book a measurement appointment/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByText("That fabric is no longer available.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fabric" })).toBeInTheDocument();
  });
});
