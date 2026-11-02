import { render, screen } from "@testing-library/react";

import { PlaceholderPage } from "@/components/placeholder-page";

describe("<PlaceholderPage>", () => {
  it("renders the title as the page heading with release and story badges", () => {
    render(<PlaceholderPage title="Shop" story="US-A1" description="Gallery of pieces." />);

    expect(screen.getByRole("heading", { level: 1, name: "Shop" })).toBeInTheDocument();
    expect(screen.getByText("MVP")).toBeInTheDocument();
    expect(screen.getByText("US-A1")).toBeInTheDocument();
    expect(screen.getByText("Gallery of pieces.")).toBeInTheDocument();
  });

  it("omits the story badge when no story is given", () => {
    render(<PlaceholderPage title="Settings" release="v1.1" />);

    expect(screen.getByText("v1.1")).toBeInTheDocument();
    expect(screen.queryByText(/^US-/)).not.toBeInTheDocument();
  });
});
