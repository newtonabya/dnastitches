"use client";

import { upload } from "@vercel/blob/client";
import Image from "next/image";
import { type ChangeEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  MAX_REFERENCE_IMAGES,
  UPLOAD_ACCEPT,
  uploadPathname,
  validateImageFile,
} from "@/lib/uploads";

export type Uploader = (pathname: string, file: File) => Promise<{ url: string }>;

const blobUpload: Uploader = (pathname, file) =>
  upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/uploads",
    contentType: file.type || undefined,
  });

/**
 * Reference images (US-B1 AC2): up to 5 JPEG/PNG/WebP/HEIC files of ≤ 8 MB. Invalid
 * files show an inline error and are never uploaded. Uploads go straight to Vercel
 * Blob using a token from /api/uploads.
 */
export function ImageUploader({
  urls,
  onChange,
  userId,
  uploadsEnabled,
  error,
  uploader = blobUpload,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  userId: string;
  uploadsEnabled: boolean;
  error?: string;
  uploader?: Uploader;
}) {
  const id = useId();
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const remaining = MAX_REFERENCE_IMAGES - urls.length;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) problems.push(problem);
      else if (accepted.length >= remaining)
        problems.push(`${file.name}: you can add up to ${MAX_REFERENCE_IMAGES} images.`);
      else accepted.push(file);
    }
    setErrors(problems);
    if (accepted.length === 0) return;

    setUploading((n) => n + accepted.length);
    const results = await Promise.allSettled(
      accepted.map((file) => uploader(uploadPathname(userId, file.name), file)),
    );
    setUploading((n) => n - accepted.length);
    const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.url] : []));
    const failed = results.flatMap((r, i) =>
      r.status === "rejected" ? [`${accepted[i]!.name}: upload failed. Please try again.`] : [],
    );
    if (failed.length) setErrors((prev) => [...prev, ...failed]);
    if (uploaded.length) onChange([...urls, ...uploaded].slice(0, MAX_REFERENCE_IMAGES));
  }

  const allErrors = [...errors, ...(error ? [error] : [])];

  return (
    <div className="flex flex-col gap-3">
      {urls.length > 0 ? (
        <ul
          className="grid grid-cols-3 gap-3 sm:grid-cols-5"
          aria-label="Uploaded reference images"
        >
          {urls.map((url, i) => (
            <li key={url} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                <Image
                  src={url}
                  alt={`Reference image ${i + 1}`}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onChange(urls.filter((u) => u !== url))}
                aria-label={`Remove reference image ${i + 1}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-files`} className="text-sm font-medium">
          Reference images ({urls.length}/{MAX_REFERENCE_IMAGES}) — optional
        </label>
        <input
          id={`${id}-files`}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          disabled={!uploadsEnabled || remaining <= 0 || uploading > 0}
          onChange={onFiles}
          aria-describedby={`${id}-hint${allErrors.length ? ` ${id}-errors` : ""}`}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground disabled:opacity-50"
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {uploadsEnabled
            ? "JPEG, PNG, WebP or HEIC, up to 8 MB each."
            : "Image uploads aren't set up yet. Describe the look in words, or send images to us later."}
        </p>
        {uploading > 0 ? (
          <p role="status" className="text-sm">
            Uploading {uploading} {uploading === 1 ? "image" : "images"}…
          </p>
        ) : null}
        {allErrors.length > 0 ? (
          <ul
            id={`${id}-errors`}
            className="flex flex-col gap-1 text-sm text-destructive"
            role="alert"
          >
            {allErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
