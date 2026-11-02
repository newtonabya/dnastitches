import {
  MAX_REFERENCE_IMAGES,
  MAX_UPLOAD_BYTES,
  isBlobUrl,
  uploadPathname,
  validateImageFile,
} from "@/lib/uploads";

describe("upload policy (US-B1 AC2)", () => {
  it("limits", () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_REFERENCE_IMAGES).toBe(5);
  });

  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.webp", "image/webp"],
    ["a.heic", "image/heic"],
    ["a.HEIC", ""],
    ["a.heif", "image/heif"],
  ])("accepts %s (%p)", (name, type) => {
    expect(validateImageFile({ name, type, size: 1000 })).toBeNull();
  });

  it.each([
    ["a.gif", "image/gif"],
    ["a.pdf", "application/pdf"],
    ["a.svg", "image/svg+xml"],
    ["a.exe", ""],
  ])("rejects %s", (name, type) => {
    expect(validateImageFile({ name, type, size: 1000 })).toMatch(/only JPEG, PNG, WebP or HEIC/);
  });

  it("enforces the 8 MB limit and rejects empty files", () => {
    expect(
      validateImageFile({ name: "a.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES }),
    ).toBeNull();
    expect(
      validateImageFile({ name: "a.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 }),
    ).toMatch(/8 MB/);
    expect(validateImageFile({ name: "a.jpg", type: "image/jpeg", size: 0 })).toMatch(/empty/);
  });

  it("isBlobUrl only accepts https Vercel Blob URLs", () => {
    expect(isBlobUrl("https://abc.public.blob.vercel-storage.com/x.jpg")).toBe(true);
    expect(isBlobUrl("http://abc.public.blob.vercel-storage.com/x.jpg")).toBe(false);
    expect(isBlobUrl("https://evil.example/x.jpg")).toBe(false);
    expect(isBlobUrl("https://public.blob.vercel-storage.com.evil.example/x.jpg")).toBe(false);
    expect(isBlobUrl("not a url")).toBe(false);
  });

  it("uploadPathname namespaces by user and sanitises", () => {
    expect(uploadPathname("u1", "My Dress (1).JPG")).toBe("custom-requests/u1/my-dress-1-.jpg");
    expect(uploadPathname("u1", "***")).toBe("custom-requests/u1/image");
  });
});
