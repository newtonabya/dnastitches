"use client";

import { Field, FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { formatNigerianPhone } from "@/lib/nigeria";
import type { updateProfileAction } from "@/server/actions/account";

export function ProfileForm({
  email,
  name,
  phone,
  smsReminders,
  action,
}: {
  email: string;
  name: string | null;
  phone: string | null;
  smsReminders: boolean;
  action: typeof updateProfileAction;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors: errors } = useFormAction(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label="Email"
        name="email"
        value={email}
        readOnly
        disabled
        hint="Your sign-in email can't be changed here."
      />
      <Field
        label="Name"
        name="name"
        defaultValue={name ?? ""}
        autoComplete="name"
        required
        error={errors.name}
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={phone ? formatNigerianPhone(phone) : ""}
        placeholder="0803 123 4567"
        hint="Nigerian mobile number. We store it as +234."
        error={errors.phone}
      />
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="smsReminders"
            defaultChecked={smsReminders}
            aria-describedby={errors.smsReminders ? "sms-reminders-error" : undefined}
            className="mt-0.5 size-4"
          />
          <span>
            Text me reminders before fittings and pickups
            <span className="block text-muted-foreground">
              Sent to the phone number above, 48 hours and 3 hours before. Emails are always sent.
            </span>
          </span>
        </label>
        {errors.smsReminders ? (
          <p id="sms-reminders-error" className="text-sm text-destructive">
            {errors.smsReminders}
          </p>
        ) : null}
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
