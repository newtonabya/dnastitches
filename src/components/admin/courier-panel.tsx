import { RefreshTrackingForm, BookCourierForm } from "@/components/admin/courier-forms";
import { Badge } from "@/components/ui/badge";
import { SHIPMENT_STATUS_LABELS } from "@/lib/courier/shipments";
import type { CourierRate, TrackingEvent } from "@/lib/courier/types";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { bookShipmentAction, refreshShipmentAction } from "@/server/actions/admin/shipments";
import { getCourierProvider, shipmentSettings } from "@/server/courier";
import {
  type ShipmentTarget,
  type ShipmentView,
  getShipmentContext,
  listShipments,
  quoteShipment,
} from "@/server/data/shipments";

const when = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/**
 * Admin courier panel (US-D5): the order's shipments with tracking, and, when it can be
 * sent, live prices and a Book courier button. Server component; call inside Suspense.
 */
export async function CourierPanel({
  target,
  chargedKobo,
}: {
  target: ShipmentTarget;
  chargedKobo: number | null;
}) {
  const provider = getCourierProvider();
  const settings = shipmentSettings();
  const [shipments, context] = await Promise.all([
    listShipments(prisma, target),
    getShipmentContext(prisma, target, settings.weightKg),
  ]);
  if (!context) return null;

  let rates: CourierRate[] = [];
  let quoteError: string | null = null;
  const canBook = provider && !context.blocker && !context.active;
  if (canBook) {
    try {
      rates = await quoteShipment(prisma, provider, target, settings);
    } catch (error) {
      quoteError = error instanceof Error ? error.message : "The courier didn't answer.";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {shipments.map((s) => (
        <ShipmentCard key={s.id} shipment={s} canRefresh={Boolean(provider)} />
      ))}

      {!provider ? (
        <p className="text-sm text-muted-foreground">
          Courier booking is off. Add your Sendbox access token (SENDBOX_API_KEY) to book deliveries
          from here.
        </p>
      ) : context.active ? null : context.blocker ? (
        <p className="text-sm text-muted-foreground">{context.blocker}</p>
      ) : quoteError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t get courier prices: {quoteError}
        </p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The courier has no delivery option for this address.
        </p>
      ) : (
        <BookCourierForm
          kind={target.kind}
          id={target.id}
          rates={rates}
          chargedKobo={chargedKobo}
          action={bookShipmentAction}
        />
      )}
    </div>
  );
}

function ShipmentCard({
  shipment: s,
  canRefresh,
}: {
  shipment: ShipmentView;
  canRefresh: boolean;
}) {
  const events = [...((s.events as unknown as TrackingEvent[]) ?? [])].reverse();
  return (
    <article
      aria-label={`Shipment ${s.trackingCode}`}
      className="flex flex-col gap-3 rounded-md border p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{s.courierName}</span>
        <Badge
          data-testid="shipment-status"
          variant={s.status === "DELIVERED" ? "default" : "outline"}
        >
          {SHIPMENT_STATUS_LABELS[s.status]}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="text-xs text-muted-foreground">Tracking</dt>
          <dd className="font-mono">{s.trackingCode}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Courier fee</dt>
          <dd>{formatNGN(s.feeKobo)}</dd>
        </div>
      </dl>
      {s.providerStatus === "drafted" ? (
        <p role="alert" className="text-sm text-destructive">
          On hold at Sendbox: top up your Sendbox wallet so the courier is dispatched.
        </p>
      ) : null}
      {events.length > 0 ? (
        <ol aria-label="Tracking history" className="flex flex-col gap-1 border-l pl-3">
          {events.map((e) => (
            <li key={`${e.at}-${e.status}`}>
              <span className="text-muted-foreground">{when.format(new Date(e.at))}</span> ·{" "}
              {e.description}
            </li>
          ))}
        </ol>
      ) : null}
      {canRefresh && s.status !== "DELIVERED" && s.status !== "CANCELLED" ? (
        <RefreshTrackingForm shipmentId={s.id} action={refreshShipmentAction} />
      ) : null}
    </article>
  );
}
