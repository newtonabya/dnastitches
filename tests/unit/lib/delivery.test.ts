import { chooseDelivery, resolveDeliveryFee } from "@/lib/delivery";

const zones = [
  { id: "z0", name: "Old Lagos", states: ["Lagos"], feeKobo: 1, etaDays: 1, isActive: false },
  { id: "z1", name: "Lagos", states: ["Lagos"], feeKobo: 3_500_00, etaDays: 2, isActive: true },
  {
    id: "z2",
    name: "South West",
    states: ["Ogun", "Oyo"],
    feeKobo: 6_000_00,
    etaDays: 4,
    isActive: true,
  },
];

describe("resolveDeliveryFee", () => {
  it("uses the first active zone covering the state (case-insensitive)", () => {
    expect(resolveDeliveryFee("lagos ", zones)).toEqual({
      available: true,
      zoneId: "z1",
      zoneName: "Lagos",
      feeKobo: 3_500_00,
      etaDays: 2,
    });
    expect(resolveDeliveryFee("Oyo", zones)).toMatchObject({ zoneId: "z2", feeKobo: 6_000_00 });
  });

  it("is unavailable when no active zone covers the state", () => {
    expect(resolveDeliveryFee("Kano", zones)).toEqual({ available: false });
    expect(resolveDeliveryFee("Lagos", [zones[0]!])).toEqual({ available: false });
  });
});

describe("chooseDelivery (US-D5)", () => {
  const zone = {
    available: true as const,
    zoneId: "z1",
    zoneName: "Lagos",
    feeKobo: 250_000,
    etaDays: 2,
  };
  const courier = { feeKobo: 310_000, courierName: "Sendbox Standard", etaDays: 3 };

  it("prefers the courier's live price", () => {
    expect(chooseDelivery(courier, zone)).toEqual({
      feeKobo: 310_000,
      etaDays: 3,
      label: "Sendbox Standard",
      zoneId: null,
      quotedBy: "Sendbox Standard",
    });
  });

  it("falls back to the zone fee, or nothing", () => {
    expect(chooseDelivery(null, zone)).toEqual({
      feeKobo: 250_000,
      etaDays: 2,
      label: "Lagos",
      zoneId: "z1",
      quotedBy: null,
    });
    expect(chooseDelivery({ ...courier, feeKobo: 0 }, zone)?.zoneId).toBe("z1");
    expect(chooseDelivery(null, { available: false })).toBeNull();
    expect(chooseDelivery(courier, { available: false })?.quotedBy).toBe("Sendbox Standard");
  });
});
