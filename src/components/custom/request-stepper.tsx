"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from "react";

import { MeasurementFields } from "@/components/account/measurement-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { earliestTargetDate } from "@/lib/custom-order/lead-time";
import { cn } from "@/lib/utils";
import {
  fabricStepSchema,
  fulfilmentStepSchema,
  makeCustomOrderRequestSchema,
  makeDesignStepSchema,
  measurementStepSchema,
} from "@/lib/validators/custom-order";
import { fieldErrors } from "@/lib/validators/fields";
import type { submitCustomOrder } from "@/server/actions/custom-order";
import type { CustomRequestPrefill } from "@/server/custom/prefill";
import type { SwatchOption } from "@/server/data/portfolio";

import { ImageUploader, type Uploader } from "./image-uploader";
import { ADVISE_ME_LABEL, SwatchGrid } from "./swatch-grid";

export const STEPS = ["Design", "Fabric", "Measurements", "Review & submit"] as const;

type Errors = Record<string, string>;

interface DesignState {
  title: string;
  description: string;
  occasion: string;
  targetDate: string;
  budgetNaira: string;
  referenceImageUrls: string[];
}

type MeasurementMode = "existing" | "new" | "appointment";

interface MeasurementState {
  mode: MeasurementMode;
  profileId: string;
  profile: Record<string, string>;
}

interface FulfilmentState {
  fulfillmentMethod: "PICKUP" | "DELIVERY";
  addressId: string;
}

export interface ProfileOption {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface AddressOption {
  id: string;
  summary: string;
  isDefault: boolean;
}

export interface RequestStepperProps {
  prefill: CustomRequestPrefill;
  swatches: SwatchOption[];
  profiles: ProfileOption[];
  addresses: AddressOption[];
  userId: string;
  uploadsEnabled: boolean;
  minLeadTimeDays: number;
  timeZone: string;
  action: typeof submitCustomOrder;
  uploader?: Uploader;
}

const STEP_PREFIX = ["design.", "fabric.", "measurements.", "fulfilment."] as const;

/** Split server field errors ("design.title") into per-step maps and pick the first step with errors. */
function splitErrors(errors: Errors): { byStep: Errors[]; firstStep: number } {
  const byStep: Errors[] = [{}, {}, {}, {}];
  let firstStep = 3;
  for (const [key, message] of Object.entries(errors)) {
    const step = STEP_PREFIX.findIndex((p) => key.startsWith(p) || key === p.slice(0, -1));
    const index = step === -1 ? 3 : step;
    const field = step === -1 ? key : key.slice(STEP_PREFIX[index]!.length) || "_step";
    byStep[index]![field] = message;
    firstStep = Math.min(firstStep, index);
  }
  return { byStep, firstStep };
}

const formObject = (form: HTMLFormElement) =>
  Object.fromEntries(Array.from(new FormData(form).entries()).map(([k, v]) => [k, String(v)]));

/**
 * Multi-step custom request (US-B1): Design → Fabric → Measurements → Review & submit.
 * Each step validates with the same Zod schema the server uses. Progress is kept in
 * client state while moving between steps (a refresh may lose it, per AC7).
 */
export function RequestStepper({
  prefill,
  swatches,
  profiles,
  addresses,
  userId,
  uploadsEnabled,
  minLeadTimeDays,
  timeZone,
  action,
  uploader,
}: RequestStepperProps) {
  const router = useRouter();
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors[]>([{}, {}, {}, {}]);
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState(prefill.notice);
  const [submitting, startSubmit] = useTransition();

  const lead = { now: () => new Date(), minLeadTimeDays, timeZone };
  const minDate = earliestTargetDate(new Date(), minLeadTimeDays, timeZone);
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  const [design, setDesign] = useState<DesignState>({
    title: prefill.title ?? "",
    description: "",
    occasion: "",
    targetDate: "",
    budgetNaira: "",
    referenceImageUrls: prefill.referenceImageUrls,
  });
  const [fabric, setFabric] = useState<string | null | undefined>(prefill.fabricSwatchId);
  const [measurements, setMeasurements] = useState<MeasurementState>({
    mode: defaultProfile ? "existing" : "new",
    profileId: defaultProfile?.id ?? "",
    profile: {},
  });
  const [fulfilment, setFulfilment] = useState<FulfilmentState>({
    fulfillmentMethod: "PICKUP",
    addressId: defaultAddress?.id ?? "",
  });

  // Move focus to the step heading whenever the step changes (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const setStepErrors = (index: number, value: Errors) =>
    setErrors((prev) => prev.map((e, i) => (i === index ? value : e)));

  const source = { fromProductId: prefill.fromProductId, fromPortfolioId: prefill.fromPortfolioId };

  function measurementInput(state: MeasurementState) {
    if (state.mode === "existing") return { mode: "existing", profileId: state.profileId };
    if (state.mode === "new") return { mode: "new", profile: state.profile };
    return { mode: "appointment" };
  }

  // ── Step handlers ───────────────────────────────────────────────────────────

  function submitDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = formObject(event.currentTarget);
    const next: DesignState = {
      title: raw.title ?? "",
      description: raw.description ?? "",
      occasion: raw.occasion ?? "",
      targetDate: raw.targetDate ?? "",
      budgetNaira: raw.budgetNaira ?? "",
      referenceImageUrls: design.referenceImageUrls,
    };
    setDesign(next);
    const result = makeDesignStepSchema(lead).safeParse(next);
    if (!result.success) return setStepErrors(0, fieldErrors(result.error));
    setStepErrors(0, {});
    setStep(1);
  }

  function submitFabric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fabric === undefined)
      return setStepErrors(1, { fabricSwatchId: `Choose a fabric, or "${ADVISE_ME_LABEL}".` });
    const result = fabricStepSchema.safeParse({ fabricSwatchId: fabric });
    if (!result.success) return setStepErrors(1, fieldErrors(result.error));
    setStepErrors(1, {});
    setStep(2);
  }

  function submitMeasurements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = formObject(event.currentTarget);
    const mode = (raw.mode as MeasurementMode | undefined) ?? measurements.mode;
    const { mode: _mode, profileId = "", ...profile } = raw;
    void _mode;
    const next: MeasurementState = {
      mode,
      profileId: mode === "existing" ? profileId : measurements.profileId,
      profile: mode === "new" ? profile : measurements.profile,
    };
    setMeasurements(next);
    const result = measurementStepSchema.safeParse(measurementInput(next));
    if (!result.success) return setStepErrors(2, fieldErrors(result.error));
    setStepErrors(2, {});
    setStep(3);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const raw = formObject(event.currentTarget);
    const nextFulfilment: FulfilmentState = {
      fulfillmentMethod: raw.fulfillmentMethod === "DELIVERY" ? "DELIVERY" : "PICKUP",
      addressId: raw.addressId ?? "",
    };
    setFulfilment(nextFulfilment);
    const fulfilmentCheck = fulfilmentStepSchema.safeParse(nextFulfilment);
    if (!fulfilmentCheck.success) return setStepErrors(3, fieldErrors(fulfilmentCheck.error));

    const input = {
      design,
      fabric: { fabricSwatchId: fabric ?? null },
      measurements: measurementInput(measurements),
      fulfilment: nextFulfilment,
      source,
    };
    const check = makeCustomOrderRequestSchema(lead).safeParse(input);
    if (!check.success) return applyErrors(fieldErrors(check.error));

    startSubmit(async () => {
      const result = await action(input);
      if (result.ok && result.data) {
        router.push(`/custom/request/success?ref=${encodeURIComponent(result.data.reference)}`);
        return;
      }
      if (!result.ok) {
        if (result.fieldErrors) applyErrors(result.fieldErrors);
        if (result.formError) setFormError(result.formError);
      }
    });
  }

  function applyErrors(all: Errors) {
    const { byStep, firstStep } = splitErrors(all);
    setErrors(byStep);
    setStep(firstStep);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const swatchName =
    fabric === null ? ADVISE_ME_LABEL : swatches.find((s) => s.id === fabric)?.name;
  const measurementSummary =
    measurements.mode === "existing"
      ? `Saved profile: ${profiles.find((p) => p.id === measurements.profileId)?.label ?? "—"}`
      : measurements.mode === "new"
        ? `New profile: ${measurements.profile.label ?? ""}`
        : "Book a measurement appointment";

  return (
    <div className="flex flex-col gap-8">
      {notice ? (
        <div
          role="status"
          className="flex items-start justify-between gap-4 rounded-md bg-muted p-4 text-sm"
        >
          <p>{notice}</p>
          <Button type="button" variant="ghost" size="xs" onClick={() => setNotice(undefined)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <nav aria-label="Request progress">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                i === step
                  ? "border-primary font-medium"
                  : i < step
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              <span className="mr-1 text-muted-foreground">{i + 1}.</span>
              {label}
            </li>
          ))}
        </ol>
      </nav>

      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
        {STEPS[step]}
      </h2>

      {step === 0 ? (
        <form
          onSubmit={submitDesign}
          noValidate
          className="flex flex-col gap-5"
          aria-label="Design"
        >
          <TextField
            label="Title"
            name="title"
            defaultValue={design.title}
            error={errors[0]!.title}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-description`} className="text-sm font-medium">
              Description
            </label>
            <textarea
              id={`${id}-description`}
              name="description"
              rows={5}
              required
              defaultValue={design.description}
              aria-invalid={errors[0]!.description ? true : undefined}
              aria-describedby={errors[0]!.description ? `${id}-description-error` : undefined}
              placeholder="Silhouette, length, details you love, anything we should know."
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
            />
            {errors[0]!.description ? (
              <p id={`${id}-description-error`} className="text-sm text-destructive">
                {errors[0]!.description}
              </p>
            ) : null}
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <TextField
              label="Occasion — optional"
              name="occasion"
              defaultValue={design.occasion}
              error={errors[0]!.occasion}
            />
            <TextField
              label="Target date — optional"
              name="targetDate"
              type="date"
              min={minDate}
              defaultValue={design.targetDate}
              error={errors[0]!.targetDate}
              hint={`At least ${minLeadTimeDays} days from today.`}
            />
            <TextField
              label="Budget (₦) — optional"
              name="budgetNaira"
              inputMode="numeric"
              defaultValue={design.budgetNaira}
              error={errors[0]!.budgetNaira}
            />
          </div>
          <ImageUploader
            urls={design.referenceImageUrls}
            onChange={(referenceImageUrls) => setDesign((d) => ({ ...d, referenceImageUrls }))}
            userId={userId}
            uploadsEnabled={uploadsEnabled}
            error={
              errors[0]!.referenceImageUrls ??
              Object.entries(errors[0]!).find(([k]) => k.startsWith("referenceImageUrls."))?.[1]
            }
            uploader={uploader}
          />
          <StepButtons />
        </form>
      ) : null}

      {step === 1 ? (
        <form
          onSubmit={submitFabric}
          noValidate
          className="flex flex-col gap-5"
          aria-label="Fabric"
        >
          <p className="text-sm text-muted-foreground">
            Choose a fabric, or let us advise you at your consultation.
          </p>
          <SwatchGrid
            swatches={swatches}
            value={fabric}
            onChange={setFabric}
            error={errors[1]!.fabricSwatchId}
          />
          <StepButtons onBack={() => setStep(0)} />
        </form>
      ) : null}

      {step === 2 ? (
        <form
          onSubmit={submitMeasurements}
          noValidate
          className="flex flex-col gap-5"
          aria-label="Measurements"
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">
              How would you like to give your measurements?
            </legend>
            {profiles.length > 0 ? (
              <ModeOption
                mode="existing"
                current={measurements.mode}
                onSelect={(mode) => setMeasurements((m) => ({ ...m, mode }))}
              >
                Use a saved profile
              </ModeOption>
            ) : null}
            <ModeOption
              mode="new"
              current={measurements.mode}
              onSelect={(mode) => setMeasurements((m) => ({ ...m, mode }))}
            >
              Enter new measurements (saved to your account for next time)
            </ModeOption>
            <ModeOption
              mode="appointment"
              current={measurements.mode}
              onSelect={(mode) => setMeasurements((m) => ({ ...m, mode }))}
            >
              Book a measurement appointment instead
            </ModeOption>
            {errors[2]!.mode ? <p className="text-sm text-destructive">{errors[2]!.mode}</p> : null}
          </fieldset>

          {measurements.mode === "existing" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-profile`} className="text-sm font-medium">
                Saved profile
              </label>
              <select
                id={`${id}-profile`}
                name="profileId"
                defaultValue={measurements.profileId}
                aria-invalid={errors[2]!.profileId ? true : undefined}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {errors[2]!.profileId ? (
                <p className="text-sm text-destructive">{errors[2]!.profileId}</p>
              ) : null}
            </div>
          ) : null}

          {measurements.mode === "new" ? (
            <MeasurementFields
              defaults={{
                label: measurements.profile.label,
                unit: measurements.profile.unit === "IN" ? "IN" : "CM",
                bust: num(measurements.profile.bust),
                waist: num(measurements.profile.waist),
                hips: num(measurements.profile.hips),
                shoulder: num(measurements.profile.shoulder),
                armLength: num(measurements.profile.armLength),
                inseam: num(measurements.profile.inseam),
                height: num(measurements.profile.height),
                notes: measurements.profile.notes,
              }}
              errors={errors[2]}
              errorPrefix="profile."
            />
          ) : null}

          {measurements.mode === "appointment" ? (
            <p className="text-sm text-muted-foreground">
              No problem. We&apos;ll contact you to arrange a measurement appointment at the studio.
            </p>
          ) : null}

          <StepButtons onBack={() => setStep(1)} />
        </form>
      ) : null}

      {step === 3 ? (
        <form
          onSubmit={submitRequest}
          noValidate
          className="flex flex-col gap-6"
          aria-label="Review and submit"
        >
          <dl className="divide-y rounded-lg border">
            <ReviewRow label="Design" onEdit={() => setStep(0)}>
              <p className="font-medium">{design.title}</p>
              <p className="whitespace-pre-line text-muted-foreground">{design.description}</p>
              <p className="text-muted-foreground">
                {[
                  design.occasion,
                  design.targetDate && `Target ${design.targetDate}`,
                  design.budgetNaira && `Budget ₦${design.budgetNaira}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No occasion, date or budget given"}
              </p>
              <p className="text-muted-foreground">
                {design.referenceImageUrls.length} reference image(s)
              </p>
            </ReviewRow>
            <ReviewRow label="Fabric" onEdit={() => setStep(1)}>
              {swatchName}
            </ReviewRow>
            <ReviewRow label="Measurements" onEdit={() => setStep(2)}>
              {measurementSummary}
            </ReviewRow>
          </dl>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Pickup or delivery?</legend>
            {(["PICKUP", "DELIVERY"] as const).map((method) => (
              <label key={method} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="fulfillmentMethod"
                  value={method}
                  checked={fulfilment.fulfillmentMethod === method}
                  onChange={() => setFulfilment((f) => ({ ...f, fulfillmentMethod: method }))}
                  className="size-4"
                />
                {method === "PICKUP"
                  ? "Pick up from the studio"
                  : "Deliver to me (fee confirmed with your quote)"}
              </label>
            ))}
          </fieldset>

          {fulfilment.fulfillmentMethod === "DELIVERY" ? (
            addresses.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-address`} className="text-sm font-medium">
                  Delivery address
                </label>
                <select
                  id={`${id}-address`}
                  name="addressId"
                  defaultValue={fulfilment.addressId}
                  aria-invalid={errors[3]!.addressId ? true : undefined}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.summary}
                    </option>
                  ))}
                </select>
                {errors[3]!.addressId ? (
                  <p className="text-sm text-destructive">{errors[3]!.addressId}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm" role="alert">
                You don&apos;t have a saved address yet.{" "}
                <a href="/account/profile" target="_blank" rel="noreferrer" className="underline">
                  Add one in your profile
                </a>{" "}
                (opens a new tab), then reload this page, or choose pickup for now.
              </p>
            )
          ) : null}

          {formError || errors[3]!._form ? (
            <p role="alert" className="text-sm text-destructive">
              {formError ?? errors[3]!._form}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

function StepButtons({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      ) : null}
      <Button type="submit">Next</Button>
    </div>
  );
}

function ModeOption({
  mode,
  current,
  onSelect,
  children,
}: {
  mode: MeasurementMode;
  current: MeasurementMode;
  onSelect: (mode: MeasurementMode) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name="mode"
        value={mode}
        checked={current === mode}
        onChange={() => onSelect(mode)}
        className="size-4"
      />
      {children}
    </label>
  );
}

function ReviewRow({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 text-sm">
      <div className="flex flex-col gap-1">
        <dt className="text-xs font-medium text-muted-foreground uppercase">{label}</dt>
        <dd className="flex flex-col gap-1">{children}</dd>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        Edit
      </Button>
    </div>
  );
}

function TextField({
  label,
  name,
  error,
  hint,
  ...props
}: { label: string; name: string; error?: string; hint?: string } & Omit<
  React.ComponentProps<"input">,
  "name" | "id"
>) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
