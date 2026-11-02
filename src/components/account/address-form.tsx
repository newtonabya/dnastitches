"use client";

import { useId } from "react";

import { Field, FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import type { createAddressAction } from "@/server/actions/account";

export function AddressForm({ action }: { action: typeof createAddressAction }) {
  const {
    state,
    pending,
    formRef,
    onSubmit,
    fieldErrors: errors,
  } = useFormAction(action, { resetOnSuccess: true });
  const stateId = useId();

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Recipient name"
        name="recipientName"
        autoComplete="name"
        required
        error={errors.recipientName}
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0803 123 4567"
        required
        error={errors.phone}
      />
      <div className="sm:col-span-2">
        <Field
          label="Address line 1"
          name="line1"
          autoComplete="address-line1"
          required
          error={errors.line1}
        />
      </div>
      <div className="sm:col-span-2">
        <Field
          label="Address line 2 (optional)"
          name="line2"
          autoComplete="address-line2"
          error={errors.line2}
        />
      </div>
      <Field
        label="City / town"
        name="city"
        autoComplete="address-level2"
        required
        error={errors.city}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={stateId} className="text-sm font-medium">
          State
        </label>
        <select
          id={stateId}
          name="state"
          required
          defaultValue=""
          autoComplete="address-level1"
          aria-invalid={errors.state ? true : undefined}
          aria-describedby={errors.state ? `${stateId}-error` : undefined}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Choose a state
          </option>
          {NIGERIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s === "FCT" ? "FCT (Abuja)" : s}
            </option>
          ))}
        </select>
        {errors.state ? (
          <p id={`${stateId}-error`} className="text-sm text-destructive">
            {errors.state}
          </p>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <Field
          label="Landmark (optional)"
          name="landmark"
          placeholder="e.g. Opposite the filling station"
          error={errors.landmark}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="isDefault" className="size-4" />
        Make this my default address
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormMessage state={state} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add address"}
          </Button>
        </div>
      </div>
    </form>
  );
}
