/**
 * Result shape for every Server Action (PRD §9 rule 2): a discriminated union,
 * never a thrown error for validation problems.
 */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

/** Initial `useActionState` value before the first submit. */
export const IDLE: ActionResult | null = null;
