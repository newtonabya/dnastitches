import { SHIPMENT_STATUS_LABELS } from "@/lib/courier/shipments";
import type { ShipmentStatusValue } from "@/lib/courier/types";

/** US-D5: the customer's view of a courier delivery: status, courier and tracking number. */
export function ShipmentNote({
  shipment,
}: {
  shipment: {
    status: ShipmentStatusValue;
    trackingCode: string;
    trackingUrl: string | null;
    courierName: string;
  };
}) {
  return (
    <span data-testid="shipment-note" className="text-xs text-muted-foreground">
      {SHIPMENT_STATUS_LABELS[shipment.status]} · {shipment.courierName} · tracking{" "}
      {shipment.trackingUrl ? (
        <a
          href={shipment.trackingUrl}
          className="font-mono underline"
          rel="noreferrer"
          target="_blank"
        >
          {shipment.trackingCode}
        </a>
      ) : (
        <span className="font-mono">{shipment.trackingCode}</span>
      )}
    </span>
  );
}
