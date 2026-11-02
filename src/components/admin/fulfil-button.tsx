"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { markOrderFulfilledAction } from "@/server/actions/admin/shop-orders";
import type { ActionResult } from "@/server/actions/types";

export function FulfilButton({
  orderId,
  label,
  action,
}: {
  orderId: string;
  label: string;
  action: typeof markOrderFulfilledAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {label}
      </Button>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}
