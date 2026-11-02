import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ImageUploader, type Uploader } from "@/components/custom/image-uploader";

function Harness({
  uploader,
  initial = [],
  uploadsEnabled = true,
}: {
  uploader: Uploader;
  initial?: string[];
  uploadsEnabled?: boolean;
}) {
  const [urls, setUrls] = useState(initial);
  return (
    <ImageUploader
      urls={urls}
      onChange={setUrls}
      userId="u1"
      uploadsEnabled={uploadsEnabled}
      uploader={uploader}
    />
  );
}

const file = (name: string, type: string, size = 1000) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("<ImageUploader> (US-B1 AC2)", () => {
  it("uploads valid files under the user's path and rejects invalid ones without uploading", async () => {
    const uploader = jest.fn(async (pathname: string) => ({
      url: `https://x.public.blob.vercel-storage.com/${pathname}`,
    }));
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness uploader={uploader} />);

    await user.upload(screen.getByLabelText(/Reference images/), [
      file("dress.jpg", "image/jpeg"),
      file("doc.pdf", "application/pdf"),
      file("huge.png", "image/png", 9 * 1024 * 1024),
    ]);

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(uploader.mock.calls[0]![0]).toBe("custom-requests/u1/dress.jpg");
    expect(await screen.findByRole("img", { name: "Reference image 1" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("doc.pdf: only JPEG, PNG, WebP or HEIC images are allowed.");
    expect(alert).toHaveTextContent("huge.png: images must be 8 MB or smaller.");
  });

  it("caps the total at 5 and supports removing images", async () => {
    const uploader = jest.fn(async (pathname: string) => ({
      url: `https://x.public.blob.vercel-storage.com/${pathname}`,
    }));
    const user = userEvent.setup();
    const initial = [1, 2, 3, 4].map((i) => `https://x.public.blob.vercel-storage.com/${i}.jpg`);
    render(<Harness uploader={uploader} initial={initial} />);

    await user.upload(screen.getByLabelText(/Reference images/), [
      file("a.jpg", "image/jpeg"),
      file("b.jpg", "image/jpeg"),
    ]);
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("b.jpg: you can add up to 5 images.");
    expect(await screen.findAllByRole("img")).toHaveLength(5);
    expect(screen.getByLabelText(/Reference images \(5\/5\)/)).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Remove reference image 1" }));
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });

  it("explains when uploads aren't configured", () => {
    render(<Harness uploader={jest.fn()} uploadsEnabled={false} />);
    expect(screen.getByLabelText(/Reference images/)).toBeDisabled();
    expect(screen.getByText(/Image uploads aren't set up yet/)).toBeInTheDocument();
  });
});
