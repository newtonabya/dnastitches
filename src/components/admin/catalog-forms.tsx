"use client";

import { useActionState, useId, useState, useTransition } from "react";

import { Field, FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { koboToNaira } from "@/lib/money";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import type {
  exportNotifyRequestsCsvAction,
  markProductSoldOutAction,
  savePortfolioItemAction,
  saveSwatchAction,
} from "@/server/actions/admin/catalog";
import type { saveDeliveryZoneAction } from "@/server/actions/admin/settings";
import type { ActionResult } from "@/server/actions/types";

import { type ImageItem, ImageListEditor, SingleImageField } from "./image-fields";

type FormActionFn = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const textareaClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]";
const selectClass = "border-input h-9 rounded-md border bg-transparent px-3 text-sm";

function TextArea({
  label,
  name,
  defaultValue,
  error,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={textareaClass}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  );
}

const naira = (kobo: number | null | undefined) =>
  kobo === null || kobo === undefined ? "" : String(koboToNaira(kobo));

// ── Products ────────────────────────────────────────────────────────────────

export interface ProductFormValues {
  id?: string;
  slug?: string;
  name: string;
  description: string;
  priceKobo: number | null;
  quantity: number;
  sizeLabel: string | null;
  bustCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  lengthCm: number | null;
  fabricComposition: string;
  careInstructions: string;
  fabricSwatchId: string | null;
  isPublished: boolean;
  images: ImageItem[];
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  description: "",
  priceKobo: null,
  quantity: 1,
  sizeLabel: null,
  bustCm: null,
  waistCm: null,
  hipsCm: null,
  lengthCm: null,
  fabricComposition: "",
  careInstructions: "",
  fabricSwatchId: null,
  isPublished: false,
  images: [],
};

/** US-C3: create or edit a product. */
export function ProductForm({
  values,
  swatches,
  uploadsEnabled,
  action,
}: {
  values: ProductFormValues;
  swatches: { id: string; name: string }[];
  uploadsEnabled: boolean;
  action: FormActionFn;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const [images, setImages] = useState(values.images);
  const id = useId();
  const editing = Boolean(values.id);

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
      aria-label={editing ? "Edit product" : "New product"}
    >
      {values.id ? <input type="hidden" name="productId" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          defaultValue={values.name}
          required
          error={fieldErrors.name}
        />
        <Field
          label="Price (₦)"
          name="priceNaira"
          inputMode="decimal"
          defaultValue={naira(values.priceKobo)}
          required
          error={fieldErrors.priceNaira}
        />
      </div>
      {editing ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            Page address: <code>/shop/{values.slug}</code>
          </p>
          <Checkbox
            name="regenerateSlug"
            label="Update the page address from the name (old links will stop working)"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          The page address is generated from the name.
        </p>
      )}
      <TextArea
        label="Description"
        name="description"
        defaultValue={values.description}
        error={fieldErrors.description}
        rows={5}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Quantity in stock"
          name="quantity"
          type="number"
          min={0}
          step={1}
          defaultValue={String(values.quantity)}
          error={fieldErrors.quantity}
          hint="0 = sold out, 1 = last one. The status badge follows this."
        />
        <Field
          label="Size label (optional)"
          name="sizeLabel"
          defaultValue={values.sizeLabel ?? ""}
          error={fieldErrors.sizeLabel}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-swatch`} className="text-sm font-medium">
            Fabric swatch (optional)
          </label>
          <select
            id={`${id}-swatch`}
            name="fabricSwatchId"
            defaultValue={values.fabricSwatchId ?? ""}
            className={selectClass}
          >
            <option value="">None</option>
            {swatches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {fieldErrors.fabricSwatchId ? (
            <p className="text-sm text-destructive">{fieldErrors.fabricSwatchId}</p>
          ) : null}
        </div>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Garment measurements in cm (optional)</legend>
        {(["bustCm", "waistCm", "hipsCm", "lengthCm"] as const).map((key) => (
          <Field
            key={key}
            label={key.replace("Cm", "").replace(/^./, (c) => c.toUpperCase())}
            name={key}
            inputMode="decimal"
            defaultValue={values[key] === null ? "" : String(values[key])}
            error={fieldErrors[key]}
          />
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea
          label="Fabric composition"
          name="fabricComposition"
          defaultValue={values.fabricComposition}
          error={fieldErrors.fabricComposition}
          rows={2}
        />
        <TextArea
          label="Care instructions"
          name="careInstructions"
          defaultValue={values.careInstructions}
          error={fieldErrors.careInstructions}
          rows={2}
        />
      </div>

      <ImageListEditor
        value={images}
        onChange={setImages}
        uploadsEnabled={uploadsEnabled}
        pathPrefix="catalog/products"
        errors={fieldErrors}
      />

      <Checkbox
        name="isPublished"
        label="Published (visible in the shop)"
        defaultChecked={values.isPublished}
      />
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save product" : "Create product"}
        </Button>
      </div>
    </form>
  );
}

/** US-C3 AC2: e.g. sold in person. */
export function MarkSoldOutButton({
  productId,
  action,
}: {
  productId: string;
  action: typeof markProductSoldOutAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <Button type="submit" variant="outline" disabled={pending}>
        Mark as sold out
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

/** US-D2 AC4: download notify-me requests as CSV. */
export function NotifyCsvButton({
  productId,
  action,
}: {
  productId: string;
  action: typeof exportNotifyRequestsCsvAction;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await action(productId);
            if (!result.ok || !result.data) {
              setError(result.ok ? "Export failed." : (result.formError ?? "Export failed."));
              return;
            }
            const url = URL.createObjectURL(
              new Blob([result.data.csv], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = result.data.filename;
            a.click();
            URL.revokeObjectURL(url);
          })
        }
      >
        {pending ? "Preparing…" : "Export CSV"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Swatches ────────────────────────────────────────────────────────────────

export interface SwatchFormValues {
  id?: string;
  name: string;
  colorHex: string;
  imageUrl: string;
  composition: string;
  isAvailable: boolean;
  sortOrder: number;
}

export function SwatchForm({
  values,
  uploadsEnabled,
  action,
}: {
  values: SwatchFormValues;
  uploadsEnabled: boolean;
  action: typeof saveSwatchAction;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action, {
    resetOnSuccess: !values.id,
  });
  const [imageUrl, setImageUrl] = useState(values.imageUrl);
  const [color, setColor] = useState(values.colorHex);
  const id = useId();
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label={values.id ? `Edit ${values.name}` : "New swatch"}
    >
      {values.id ? <input type="hidden" name="swatchId" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Name"
          name="name"
          defaultValue={values.name}
          required
          error={fieldErrors.name}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-color`} className="text-sm font-medium">
            Colour
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Pick colour"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="h-9 w-12 rounded border"
            />
            <input
              id={`${id}-color`}
              name="colorHex"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-invalid={fieldErrors.colorHex ? true : undefined}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </div>
          {fieldErrors.colorHex ? (
            <p className="text-sm text-destructive">{fieldErrors.colorHex}</p>
          ) : null}
        </div>
        <Field
          label="Sort order"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={String(values.sortOrder)}
          error={fieldErrors.sortOrder}
        />
      </div>
      <Field
        label="Composition"
        name="composition"
        defaultValue={values.composition}
        required
        error={fieldErrors.composition}
      />
      <SingleImageField
        value={imageUrl}
        onChange={setImageUrl}
        uploadsEnabled={uploadsEnabled}
        pathPrefix="catalog/swatches"
        error={fieldErrors.imageUrl}
        label="Swatch image"
      />
      <Checkbox
        name="isAvailable"
        label="Available for custom requests"
        defaultChecked={values.isAvailable}
      />
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save swatch" : "Add swatch"}
        </Button>
      </div>
    </form>
  );
}

// ── Portfolio ───────────────────────────────────────────────────────────────

export interface PortfolioFormValues {
  id?: string;
  title: string;
  description: string;
  imageUrl: string;
  tags: string[];
  isPublished: boolean;
  sourceProductId: string | null;
}

export function PortfolioForm({
  values,
  products,
  uploadsEnabled,
  action,
}: {
  values: PortfolioFormValues;
  products: { id: string; name: string }[];
  uploadsEnabled: boolean;
  action: typeof savePortfolioItemAction;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action, {
    resetOnSuccess: !values.id,
  });
  const [imageUrl, setImageUrl] = useState(values.imageUrl);
  const id = useId();
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label={values.id ? `Edit ${values.title}` : "New portfolio item"}
    >
      {values.id ? <input type="hidden" name="portfolioItemId" value={values.id} /> : null}
      <Field
        label="Title"
        name="title"
        defaultValue={values.title}
        required
        error={fieldErrors.title}
      />
      <TextArea
        label="Description"
        name="description"
        defaultValue={values.description}
        error={fieldErrors.description}
        rows={3}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Tags (comma separated)"
          name="tags"
          defaultValue={values.tags.join(", ")}
          error={fieldErrors.tags}
          hint="e.g. bridal, aso-oke"
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-source`} className="text-sm font-medium">
            Based on product (optional)
          </label>
          <select
            id={`${id}-source`}
            name="sourceProductId"
            defaultValue={values.sourceProductId ?? ""}
            className={selectClass}
          >
            <option value="">None</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {fieldErrors.sourceProductId ? (
            <p className="text-sm text-destructive">{fieldErrors.sourceProductId}</p>
          ) : null}
        </div>
      </div>
      <SingleImageField
        value={imageUrl}
        onChange={setImageUrl}
        uploadsEnabled={uploadsEnabled}
        pathPrefix="catalog/portfolio"
        error={fieldErrors.imageUrl}
        label="Portfolio image"
      />
      <Checkbox
        name="isPublished"
        label="Published (visible in the gallery)"
        defaultChecked={values.isPublished}
      />
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save item" : "Add item"}
        </Button>
      </div>
    </form>
  );
}

// ── Delivery zones ──────────────────────────────────────────────────────────

export interface ZoneFormValues {
  id?: string;
  name: string;
  states: string[];
  feeKobo: number | null;
  etaDays: number;
  isActive: boolean;
}

export function DeliveryZoneForm({
  values,
  action,
}: {
  values: ZoneFormValues;
  action: typeof saveDeliveryZoneAction;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action, {
    resetOnSuccess: !values.id,
  });
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label={values.id ? `Edit ${values.name}` : "New delivery zone"}
    >
      {values.id ? <input type="hidden" name="zoneId" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Zone name"
          name="name"
          defaultValue={values.name}
          required
          error={fieldErrors.name}
        />
        <Field
          label="Fee (₦)"
          name="feeNaira"
          inputMode="decimal"
          defaultValue={naira(values.feeKobo)}
          required
          error={fieldErrors.feeNaira}
        />
        <Field
          label="Delivery time (days)"
          name="etaDays"
          type="number"
          min={0}
          defaultValue={String(values.etaDays)}
          error={fieldErrors.etaDays}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">States covered</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">
          {NIGERIAN_STATES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="states"
                value={s}
                defaultChecked={values.states.includes(s)}
                className="size-4"
              />
              {s === "FCT" ? "FCT (Abuja)" : s}
            </label>
          ))}
        </div>
        {fieldErrors.states ? (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.states}</p>
        ) : null}
      </fieldset>
      <Checkbox
        name="isActive"
        label="Active (offered at checkout)"
        defaultChecked={values.isActive}
      />
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save zone" : "Add zone"}
        </Button>
      </div>
    </form>
  );
}
