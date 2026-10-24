import type { BrochureKind } from "./types";

/** Brochure download addresses. Client-safe. */

/** Public: counted, and behind the email gate when Settings -> Leads asks for one. */
export const brochurePath = (kind: BrochureKind, id: string) => `/api/brochure/${kind}/${id}`;

/** Admin: always the generated PDF, opened in the browser. */
export const adminBrochurePath = (kind: BrochureKind, id: string) =>
  `/api/admin/brochure/${kind}/${id}`;
