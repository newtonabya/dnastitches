import { restockEmail } from "@/emails/restock";

describe("restockEmail (US-D4)", () => {
  it("links to the piece, states the price and promises no more emails", () => {
    const email = restockEmail({
      to: "ada@example.com",
      productName: "Adire <Wrap> Dress",
      slug: "adire-wrap-dress",
      priceKobo: 120_000_00,
      siteUrl: "https://dna.example",
    });
    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("It's back: Adire <Wrap> Dress");
    expect(email.text).toContain("is available again (₦120,000.00)");
    expect(email.text).toContain("https://dna.example/shop/adire-wrap-dress");
    expect(email.text).toContain("This is the only email we'll send about it.");
    expect(email.html).toContain("Adire &lt;Wrap&gt; Dress");
  });
});
