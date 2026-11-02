import { render, screen } from "@testing-library/react";

import { ProductCard } from "@/components/shop/product-card";
import type { ProductCardData } from "@/server/data/products";

const base: ProductCardData = {
  id: "p1",
  slug: "adire-wrap-dress",
  name: "Adire Wrap Dress",
  priceKobo: 18_500_000,
  inventoryStatus: "AVAILABLE",
  image: { url: "https://placehold.co/800x1000/png?text=x", alt: "Adire Wrap Dress — front" },
};

describe("<ProductCard> (US-A1)", () => {
  it("links to the product and shows image, name, price and badge", () => {
    render(<ProductCard product={base} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/shop/adire-wrap-dress");
    expect(screen.getByRole("heading", { name: "Adire Wrap Dress" })).toBeInTheDocument();
    expect(screen.getByText("₦185,000.00")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Adire Wrap Dress — front" })).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("AVAILABLE: full colour, no overlay", () => {
    render(<ProductCard product={base} />);
    expect(screen.getByRole("img")).not.toHaveClass("grayscale");
    expect(screen.queryByTestId("sold-out-overlay")).not.toBeInTheDocument();
  });

  it("LOW_STOCK: Last One badge, full colour", () => {
    render(<ProductCard product={{ ...base, inventoryStatus: "LOW_STOCK" }} />);
    expect(screen.getByText("Last One")).toBeInTheDocument();
    expect(screen.getByRole("img")).not.toHaveClass("grayscale");
    expect(screen.queryByTestId("sold-out-overlay")).not.toBeInTheDocument();
  });

  it("SOLD_OUT: greyscale image, translucent overlay and 1-of-1 · Sold badge", () => {
    render(<ProductCard product={{ ...base, inventoryStatus: "SOLD_OUT" }} />);
    expect(screen.getByRole("img")).toHaveClass("grayscale");
    expect(screen.getByTestId("sold-out-overlay")).toBeInTheDocument();
    expect(screen.getByText("1-of-1 · Sold")).toBeInTheDocument();
  });

  it("renders a placeholder when there is no image", () => {
    render(<ProductCard product={{ ...base, image: null }} />);
    expect(screen.getByText("No image")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
