/**
 * Image upload policy (US-B1 AC2), shared by the client uploader and the
 * server-issued upload token route so both enforce identical rules.
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_REFERENCE_IMAGES = 5;
export const MAX_REPAIR_PHOTOS = 3;

export const UPLOAD_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

/** Returns a user-facing error, or `null` if the file may be uploaded. */
export function validateImageFile(file: FileLike): string | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const typeOk = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase());
  // Some browsers report HEIC/HEIF with an empty MIME type; fall back to the extension then.
  const extOk = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  if (!(typeOk || (file.type === "" && extOk))) {
    return `${file.name}: only JPEG, PNG, WebP or HEIC images are allowed.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name}: images must be 8 MB or smaller.`;
  if (file.size === 0) return `${file.name}: this file is empty.`;
  return null;
}

/** Hosts that uploaded images are served from (Vercel Blob public stores). */
export function isBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Where customers' custom-request images go: namespaced per user. */
export const customRequestUploadPrefix = (userId: string) => `custom-requests/${userId}`;

/** Admin catalog images (products, swatches, portfolio). Only admins may upload here. */
export const CATALOG_UPLOAD_PREFIX = "catalog";

/** Upload pathname under a prefix, with a sanitised filename. */
export function uploadPathname(prefix: string, filename: string): string {
  const safe =
    filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image";
  return `${prefix}/${safe}`;
}
