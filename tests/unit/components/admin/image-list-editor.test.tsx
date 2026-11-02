import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { type ImageItem, ImageListEditor } from "@/components/admin/image-fields";

const blob = (n: string) => `https://x.public.blob.vercel-storage.com/catalog/products/${n}.jpg`;

function Harness({ initial }: { initial: ImageItem[] }) {
  const [images, setImages] = useState(initial);
  return (
    <form aria-label="f">
      <ImageListEditor
        value={images}
        onChange={setImages}
        uploadsEnabled
        pathPrefix="catalog/products"
        uploader={async (pathname) => ({
          url: `https://x.public.blob.vercel-storage.com/${pathname}`,
        })}
      />
    </form>
  );
}

const hidden = () =>
  JSON.parse(
    (document.querySelector('input[name="images"]') as HTMLInputElement).value,
  ) as ImageItem[];

describe("<ImageListEditor> (US-C3 AC1)", () => {
  it("reorders, edits alt text and removes images, keeping the hidden JSON in sync", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: blob("a"), alt: "Front" },
          { url: blob("b"), alt: "Back" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Move image 1 up" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move image 2 up" }));
    expect(hidden().map((i) => i.alt)).toEqual(["Back", "Front"]);

    const alt = screen.getByLabelText("Image 2 description (alt text)");
    await user.clear(alt);
    await user.type(alt, "Front view");
    expect(hidden()[1]).toEqual({ url: blob("a"), alt: "Front view" });

    await user.click(screen.getByRole("button", { name: "Remove image 1" }));
    expect(hidden()).toEqual([{ url: blob("a"), alt: "Front view" }]);
  });

  it("appends uploaded images under the catalog prefix with empty alt text", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);
    await user.upload(
      screen.getByLabelText(/Add images/),
      new File(["x"], "Side.JPG", { type: "image/jpeg" }),
    );
    expect(await screen.findByLabelText("Image 1 description (alt text)")).toHaveValue("");
    expect(hidden()).toEqual([
      { url: "https://x.public.blob.vercel-storage.com/catalog/products/side.jpg", alt: "" },
    ]);
  });
});
