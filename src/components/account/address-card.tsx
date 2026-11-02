"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNigerianPhone } from "@/lib/nigeria";
import type { deleteAddressAction, setDefaultAddressAction } from "@/server/actions/account";
import type { ActionResult } from "@/server/actions/types";
import type { AccountAddress } from "@/server/data/account";

export function AddressCard({
  address,
  setDefault,
  remove,
}: {
  address: AccountAddress;
  setDefault: typeof setDefaultAddressAction;
  remove: typeof deleteAddressAction;
}) {
  const [defaultState, defaultAction, settingDefault] = useActionState<
    ActionResult | null,
    FormData
  >(setDefault, null);
  const [removeState, removeAction, removing] = useActionState<ActionResult | null, FormData>(
    remove,
    null,
  );

  return (
    <article
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-label={`Address for ${address.recipientName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <address className="text-sm not-italic">
          <span className="font-medium">{address.recipientName}</span>
          <br />
          {address.line1}
          {address.line2 ? (
            <>
              <br />
              {address.line2}
            </>
          ) : null}
          <br />
          {address.city}, {address.state === "FCT" ? "FCT (Abuja)" : address.state}
          {address.landmark ? (
            <>
              <br />
              <span className="text-muted-foreground">Landmark: {address.landmark}</span>
            </>
          ) : null}
          <br />
          {formatNigerianPhone(address.phone)}
        </address>
        {address.isDefault ? <Badge variant="secondary">Default</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {!address.isDefault ? (
          <form action={defaultAction}>
            <input type="hidden" name="addressId" value={address.id} />
            <Button type="submit" size="sm" variant="outline" disabled={settingDefault}>
              Make default
            </Button>
          </form>
        ) : null}
        <form action={removeAction}>
          <input type="hidden" name="addressId" value={address.id} />
          <Button type="submit" size="sm" variant="ghost" disabled={removing}>
            Delete
          </Button>
        </form>
      </div>
      {defaultState && !defaultState.ok ? <FormMessage state={defaultState} /> : null}
      {removeState && !removeState.ok ? <FormMessage state={removeState} /> : null}
    </article>
  );
}
