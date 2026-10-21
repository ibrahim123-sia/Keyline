import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { redirectIfMoved } from "@/features/seo/serve";
import { site } from "@/lib/i18n";

/**
 * Any address no other route takes (old site addresses, mistyped links): served by the
 * redirects manager when a rule covers it, otherwise the 404 page (logged by the monitor).
 * Nothing here streams, so both answers carry their real status (308/307 or 404).
 */
export const instant = false;
export const metadata = { title: site.errors.notFoundTitle, robots: { index: false } };

export default async function MissingPage(props: PageProps<"/[...missing]">) {
  const { missing } = await props.params;
  const path = (await headers()).get("x-lintel-path") ?? `/${missing.join("/")}`;
  await redirectIfMoved(path);
  notFound();
}
