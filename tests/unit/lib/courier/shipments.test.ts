import {
  SHIPMENT_STATUS_LABELS,
  cheapestRate,
  isActiveShipmentStatus,
  isFinalShipmentStatus,
  mergeTrackingEvents,
  nextShipmentStatus,
} from "@/lib/courier/shipments";
import { SHIPMENT_STATUSES } from "@/lib/courier/types";

describe("nextShipmentStatus", () => {
  it("moves forward", () => {
    expect(nextShipmentStatus("BOOKED", "PICKED_UP")).toBe("PICKED_UP");
    expect(nextShipmentStatus("PICKED_UP", "DELIVERED")).toBe("DELIVERED");
  });
  it("never moves backwards on a late update", () => {
    expect(nextShipmentStatus("IN_TRANSIT", "PICKED_UP")).toBe("IN_TRANSIT");
    expect(nextShipmentStatus("OUT_FOR_DELIVERY", "BOOKED")).toBe("OUT_FOR_DELIVERY");
  });
  it("never leaves delivered or cancelled", () => {
    expect(nextShipmentStatus("DELIVERED", "IN_TRANSIT")).toBe("DELIVERED");
    expect(nextShipmentStatus("DELIVERED", "FAILED")).toBe("DELIVERED");
    expect(nextShipmentStatus("CANCELLED", "DELIVERED")).toBe("CANCELLED");
  });
  it("records failure or cancellation from any open state", () => {
    expect(nextShipmentStatus("IN_TRANSIT", "FAILED")).toBe("FAILED");
    expect(nextShipmentStatus("BOOKED", "CANCELLED")).toBe("CANCELLED");
  });
  it("lets a failed delivery recover only to delivered", () => {
    expect(nextShipmentStatus("FAILED", "IN_TRANSIT")).toBe("FAILED");
    expect(nextShipmentStatus("FAILED", "DELIVERED")).toBe("DELIVERED");
  });
});

describe("status helpers", () => {
  it("has a label for every status", () => {
    for (const s of SHIPMENT_STATUSES) expect(SHIPMENT_STATUS_LABELS[s]).toBeTruthy();
  });
  it("knows which statuses are final and which block a new booking", () => {
    expect(SHIPMENT_STATUSES.filter(isFinalShipmentStatus)).toEqual(["DELIVERED", "CANCELLED"]);
    expect(SHIPMENT_STATUSES.filter((s) => !isActiveShipmentStatus(s))).toEqual([
      "CANCELLED",
      "FAILED",
    ]);
  });
});

describe("mergeTrackingEvents", () => {
  it("de-duplicates and sorts oldest first", () => {
    const a = { at: "2026-11-05T10:00:00Z", status: "BOOKED" as const, description: "Booked" };
    const b = {
      at: "2026-11-05T12:00:00Z",
      status: "PICKED_UP" as const,
      description: "Picked up",
    };
    const c = { at: "2026-11-06T09:00:00Z", status: "DELIVERED" as const, description: "Done" };
    expect(mergeTrackingEvents([b, a], [a, c, b])).toEqual([a, b, c]);
  });
});

describe("cheapestRate", () => {
  const rate = (rateId: string, feeKobo: number, etaDays: number | null = null) => ({
    rateId,
    courierName: rateId,
    feeKobo,
    etaDays,
  });
  it("picks the lowest fee, then the quickest", () => {
    expect(cheapestRate([rate("a", 500_000), rate("b", 300_000), rate("c", 400_000)])?.rateId).toBe(
      "b",
    );
    expect(cheapestRate([rate("slow", 300_000, 5), rate("fast", 300_000, 2)])?.rateId).toBe("fast");
    expect(cheapestRate([rate("unknown", 300_000), rate("known", 300_000, 3)])?.rateId).toBe(
      "known",
    );
  });
  it("ignores unusable rates", () => {
    expect(cheapestRate([])).toBeNull();
    expect(cheapestRate([rate("free", 0), rate("bad", 12.5)])).toBeNull();
  });
});
