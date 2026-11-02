"use client";

import Image from "next/image";
import { useId } from "react";

import { ImageUploader, type Uploader } from "@/components/custom/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ImageItem {
  url: string;
  alt: string;
}

/**
 * Ordered product images (US-C3 AC1): upload, alt text, reorder with Move up/down
 * buttons (keyboard and screen-reader friendly), remove. Serialised into a hidden
 * `images` JSON field for the form.
 */
export function ImageListEditor({
  value,
  onChange,
  uploadsEnabled,
  pathPrefix,
  errors = {},
  uploader,
}: {
  value: ImageItem[];
  onChange: (images: ImageItem[]) => void;
  uploadsEnabled: boolean;
  pathPrefix: string;
  errors?: Record<string, string>;
  uploader?: Uploader;
}) {
  const id = useId();
  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Images (the first one is the main image)</legend>
      <input type="hidden" name="images" value={JSON.stringify(value)} />
      {value.length > 0 ? (
        <ol className="flex flex-col gap-3" aria-label="Product images in display order">
          {value.map((img, i) => (
            <li key={img.url} className="flex flex-wrap items-start gap-3 rounded-md border p-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded bg-muted">
                <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
              </div>
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <label htmlFor={`${id}-alt-${i}`} className="text-sm font-medium">
                  Image {i + 1} description (alt text)
                </label>
                <Input
                  id={`${id}-alt-${i}`}
                  value={img.alt}
                  onChange={(e) =>
                    onChange(value.map((v, j) => (j === i ? { ...v, alt: e.target.value } : v)))
                  }
                  aria-invalid={
                    errors[`images.${i}.alt`] || errors[`images.${i}.url`] ? true : undefined
                  }
                />
                {(errors[`images.${i}.alt`] ?? errors[`images.${i}.url`]) ? (
                  <p className="text-sm text-destructive">
                    {errors[`images.${i}.alt`] ?? errors[`images.${i}.url`]}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`Move image ${i + 1} up`}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Move image ${i + 1} down`}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Remove image ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No images yet.</p>
      )}
      {errors.images ? <p className="text-sm text-destructive">{errors.images}</p> : null}
      <ImageUploader
        urls={[]}
        onChange={(urls) => onChange([...value, ...urls.map((url) => ({ url, alt: "" }))])}
        label="Add images"
        max={Math.max(0, 12 - value.length)}
        pathPrefix={pathPrefix}
        uploadsEnabled={uploadsEnabled}
        uploader={uploader}
      />
    </fieldset>
  );
}

/** A single required image (swatches, portfolio) stored in a hidden `imageUrl` field. */
export function SingleImageField({
  value,
  onChange,
  uploadsEnabled,
  pathPrefix,
  error,
  label = "Image",
  uploader,
}: {
  value: string;
  onChange: (url: string) => void;
  uploadsEnabled: boolean;
  pathPrefix: string;
  error?: string;
  label?: string;
  uploader?: Uploader;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <input type="hidden" name="imageUrl" value={value} />
      {value ? (
        <div className="relative size-32 overflow-hidden rounded-md bg-muted">
          <Image
            src={value}
            alt={`Current ${label.toLowerCase()}`}
            fill
            sizes="128px"
            className="object-cover"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No image yet.</p>
      )}
      <ImageUploader
        urls={[]}
        onChange={(urls) => urls[0] && onChange(urls[urls.length - 1]!)}
        label={value ? "Replace image" : "Upload image"}
        max={1}
        optional={false}
        pathPrefix={pathPrefix}
        uploadsEnabled={uploadsEnabled}
        uploader={uploader}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}
