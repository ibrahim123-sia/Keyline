import { render } from "@react-email/render";
import type { ReactElement } from "react";

/** HTML + plain-text versions of a React Email template (13 §1: plain text included). */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
