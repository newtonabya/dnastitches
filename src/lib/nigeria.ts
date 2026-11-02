/** Nigeria-specific reference data (D-8). */

/** The 36 states plus the Federal Capital Territory, alphabetical. */
export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

export function isNigerianState(value: string): value is NigerianState {
  return (NIGERIAN_STATES as readonly string[]).includes(value);
}

/**
 * Normalise a Nigerian mobile number to E.164 (`+234…`), PRD §5.3.
 * Accepts `08031234567`, `+2348031234567`, `2348031234567`, `8031234567`, with
 * spaces, dashes, dots or parentheses. Returns `null` if it is not a valid
 * Nigerian mobile number (070x–091x ranges: 7/8/9 then 0/1, then 8 digits).
 */
export function normalizeNigerianPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, "");
  let national: string;
  if (compact.startsWith("+234")) national = compact.slice(4);
  else if (compact.startsWith("234") && compact.length === 13) national = compact.slice(3);
  else if (compact.startsWith("0")) national = compact.slice(1);
  else national = compact;
  return /^[789][01]\d{8}$/.test(national) ? `+234${national}` : null;
}

/** Display an E.164 Nigerian number in local format, e.g. `+2348031234567` → `0803 123 4567`. */
export function formatNigerianPhone(e164: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164;
}
