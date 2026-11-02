/** @jest-environment node */
const mockEnv: Record<string, unknown> = {};
// Lazy getter: jest.mock is hoisted above the const declaration.
jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

import { getEmailSender, sendEmail } from "@/lib/email";

const message = { to: "ada@example.com", subject: "Hello", text: "Body", html: "<p>Body</p>" };

afterEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  jest.restoreAllMocks();
});

describe("email (PRD §9 email abstraction)", () => {
  it("sends attachments to Resend as base64 and lists them in dev logs", async () => {
    const ics = {
      filename: "invite.ics",
      content: "BEGIN:VCALENDAR",
      contentType: "text/calendar",
    };
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail({ ...message, attachments: [ics] });
    expect(info.mock.calls[0]![0]).toContain("Attachments: invite.ics");

    mockEnv.RESEND_API_KEY = "re_test";
    const fetchMock = jest.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await sendEmail({ ...message, attachments: [ics] });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).attachments).toEqual([
      {
        filename: "invite.ics",
        content: Buffer.from("BEGIN:VCALENDAR").toString("base64"),
        content_type: "text/calendar",
      },
    ]);
  });

  it("logs instead of sending when RESEND_API_KEY is not set", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendEmail(message)).toBe(true);
    expect(info.mock.calls[0]![0]).toContain("Subject: Hello");
  });

  it("posts to Resend with the API key and sender", async () => {
    mockEnv.RESEND_API_KEY = "re_test";
    mockEnv.EMAIL_FROM = "DNA Stitches <hi@example.com>";
    const fetchMock = jest.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await sendEmail(message)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "DNA Stitches <hi@example.com>",
      to: ["ada@example.com"],
      subject: "Hello",
      text: "Body",
      html: "<p>Body</p>",
    });
  });

  it("never throws: failures are logged without the recipient and return false", async () => {
    mockEnv.RESEND_API_KEY = "re_test";
    global.fetch = jest.fn(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendEmail(message, getEmailSender())).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain("ada@example.com");
    expect(JSON.stringify(error.mock.calls)).toContain("Resend responded 500");
  });

  it("accepts an injected sender", async () => {
    const send = jest.fn(async () => {});
    expect(await sendEmail(message, { send })).toBe(true);
    expect(send).toHaveBeenCalledWith(message);
  });
});
