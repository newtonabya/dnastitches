/** @jest-environment node */
import { MAX_SMS_LENGTH, reminderSms } from "@/lib/sms/messages";
import { SmsError, TERMII_SEND_URL, createTermiiProvider, toTermiiNumber } from "@/lib/sms/termii";
import { wantsTextReminders } from "@/lib/scheduling/reminders";

describe("Termii provider (v1.2 US-G2)", () => {
  const config = { apiKey: "TLkey", senderId: "DNAStitch", channel: "dnd" as const };

  it("posts the message without the + on the number", async () => {
    const fetchMock = jest.fn(async () =>
      Response.json({ message_id: "9122", message: "Successfully Sent" }),
    );
    await createTermiiProvider(config, fetchMock as unknown as typeof fetch).send({
      to: "+2348031234567",
      text: "Hello",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TERMII_SEND_URL);
    expect(JSON.parse(init.body as string)).toEqual({
      api_key: "TLkey",
      to: "2348031234567",
      from: "DNAStitch",
      sms: "Hello",
      type: "plain",
      channel: "dnd",
    });
  });

  it("throws Termii's reason (never the key) on failure", async () => {
    const failing = jest.fn(async () =>
      Response.json({ message: "Insufficient balance" }, { status: 400 }),
    );
    const send = createTermiiProvider(config, failing as unknown as typeof fetch).send({
      to: "+2348031234567",
      text: "Hi",
    });
    await expect(send).rejects.toThrow("Termii responded 400: Insufficient balance");
    await expect(send).rejects.not.toThrow(/TLkey/);
    const noId = jest.fn(async () => new Response("oops", { status: 200 }));
    await expect(
      createTermiiProvider(config, noId as unknown as typeof fetch).send({
        to: "+2348031234567",
        text: "x",
      }),
    ).rejects.toBeInstanceOf(SmsError);
  });

  it("normalises numbers and rejects junk", () => {
    expect(toTermiiNumber("+234 803 123 4567")).toBe("2348031234567");
    expect(() => toTermiiNumber("12")).toThrow(SmsError);
  });
});

describe("reminderSms", () => {
  it("states the appointment in studio time with a link, in plain ASCII within two SMS", () => {
    const text = reminderSms({
      type: "FITTING",
      startsAt: new Date("2026-11-10T09:00:00Z"),
      timeZone: "Africa/Lagos",
      siteUrl: "https://dnastitches.com",
    });
    expect(text).toBe(
      "DNA Stitches: reminder of your fitting on Tue 10 Nov, 10:00 (Lagos time). To change it: https://dnastitches.com/account/appointments",
    );
    expect(text.length).toBeLessThanOrEqual(MAX_SMS_LENGTH);
    expect(/^[\x20-\x7E]*$/.test(text)).toBe(true);
    expect(
      reminderSms({
        type: "PICKUP",
        startsAt: new Date(),
        timeZone: "Africa/Lagos",
        siteUrl: `https://${"x".repeat(400)}`,
      }).length,
    ).toBe(MAX_SMS_LENGTH);
  });

  it("needs both an opt-in and a phone", () => {
    expect(wantsTextReminders({ smsReminders: true, phone: "+2348031234567" })).toBe(true);
    expect(wantsTextReminders({ smsReminders: true, phone: null })).toBe(false);
    expect(wantsTextReminders({ smsReminders: false, phone: "+2348031234567" })).toBe(false);
  });
});
