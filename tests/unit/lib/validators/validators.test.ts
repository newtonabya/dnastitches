import { addressSchema } from "@/lib/validators/address";
import { checkbox, emailAddress, fieldErrors } from "@/lib/validators/fields";
import { notificationRequestSchema } from "@/lib/validators/notification-request";
import { profileSchema } from "@/lib/validators/profile";

describe("profileSchema (US-E1 AC4)", () => {
  it("trims the name and normalises phone to +234", () => {
    expect(profileSchema.parse({ name: "  Ada  ", phone: "0803 123 4567" })).toEqual({
      name: "Ada",
      phone: "+2348031234567",
    });
  });

  it("phone is optional (empty string allowed)", () => {
    expect(profileSchema.parse({ name: "Ada", phone: "" })).toEqual({ name: "Ada" });
    expect(profileSchema.parse({ name: "Ada" })).toEqual({ name: "Ada" });
  });

  it("rejects an empty name and an invalid phone with field messages", () => {
    const result = profileSchema.safeParse({ name: " ", phone: "12345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        name: "Name is required",
        phone: "Enter a valid Nigerian mobile number, e.g. 0803 123 4567",
      });
    }
  });

  it("caps name length", () => {
    expect(profileSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });
});

describe("addressSchema", () => {
  const valid = {
    recipientName: "Ada Obi",
    phone: "08031234567",
    line1: "12 Admiralty Way",
    line2: "",
    city: "Lekki",
    state: "Lagos",
    landmark: "",
  };

  it("parses a valid address and drops empty optionals", () => {
    expect(addressSchema.parse(valid)).toEqual({
      recipientName: "Ada Obi",
      phone: "+2348031234567",
      line1: "12 Admiralty Way",
      line2: undefined,
      city: "Lekki",
      state: "Lagos",
      landmark: undefined,
      isDefault: false,
    });
  });

  it("isDefault reads an HTML checkbox", () => {
    expect(addressSchema.parse({ ...valid, isDefault: "on" }).isDefault).toBe(true);
  });

  it.each([
    ["state", { state: "Greater Accra" }, "Choose a state"],
    ["line1", { line1: "" }, "Address line 1 is required"],
    ["phone", { phone: "" }, "Phone number is required"],
    ["city", { city: undefined }, "City / town is required"],
  ])("rejects bad %s", (field, patch, message) => {
    const result = addressSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)[field]).toBe(message);
  });
});

describe("notificationRequestSchema (US-D2)", () => {
  it("normalises email and de-duplicates types", () => {
    expect(
      notificationRequestSchema.parse({
        email: "  Ada@Example.COM ",
        productId: "prod_1",
        types: ["RESTOCK", "SIMILAR_FABRIC", "RESTOCK"],
      }),
    ).toEqual({
      email: "ada@example.com",
      productId: "prod_1",
      types: ["RESTOCK", "SIMILAR_FABRIC"],
    });
  });

  it("requires at least one type and a valid email", () => {
    const result = notificationRequestSchema.safeParse({
      email: "nope",
      productId: "p",
      types: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toMatchObject({
        email: "Enter a valid email address",
        types: "Choose at least one option",
      });
    }
  });

  it("rejects unknown types", () => {
    expect(
      notificationRequestSchema.safeParse({ email: "a@b.co", productId: "p", types: ["SPAM"] })
        .success,
    ).toBe(false);
  });
});

describe("field helpers", () => {
  it("checkbox", () => {
    expect(checkbox.parse(undefined)).toBe(false);
    expect(checkbox.parse("on")).toBe(true);
    expect(checkbox.parse("false")).toBe(false);
    expect(checkbox.parse(true)).toBe(true);
  });

  it("emailAddress", () => {
    expect(emailAddress.parse(" X@Y.io ")).toBe("x@y.io");
    expect(emailAddress.safeParse("x@").success).toBe(false);
  });

  it("fieldErrors keeps the first message per field and maps root issues to _form", () => {
    const result = notificationRequestSchema.safeParse("not an object");
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(fieldErrors(result.error))).toEqual(["_form"]);
  });
});
