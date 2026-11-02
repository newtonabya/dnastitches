/**
 * Unit-test stand-in for `@vercel/blob/client`, whose ESM-only dependencies Jest
 * can't load. Component tests inject their own `uploader`, so this must never run.
 */
export async function upload(): Promise<never> {
  throw new Error("@vercel/blob/client is stubbed in unit tests; pass an `uploader` prop instead.");
}
