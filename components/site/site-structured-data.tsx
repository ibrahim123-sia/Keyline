import { getPublicMedia } from "@/features/media/queries";
import { graph, organizationJsonLd, websiteJsonLd } from "@/features/seo/structured-data";
import { getSettings } from "@/features/settings/queries";
import { socialKeys } from "@/features/settings/schema";
import { siteOrigin, siteUrl } from "@/features/site/url";
import { JsonLd } from "./json-ld";

/**
 * The agency (RealEstateAgent) and the site (WebSite with a search box) on every public page
 * (08 §6). Settings -> SEO -> Organisation wins; General and Contact fill the gaps.
 */
export async function SiteStructuredData() {
  const [seo, general, contact] = await Promise.all([
    getSettings("seo"),
    getSettings("general"),
    getSettings("contact"),
  ]);
  const org = seo.organisation;
  const logo = await getPublicMedia(org.logoId ?? general.logoLightId);
  const origin = siteOrigin();
  const name = org.name || general.agencyName;
  return (
    <JsonLd
      data={graph([
        organizationJsonLd({
          origin,
          name,
          legalName: general.legalName,
          description: general.shortDescription,
          logoUrl: logo ? siteUrl(logo.url) : null,
          phone: org.phone || contact.phone,
          email: contact.email,
          address: org.address || contact.address,
          sameAs: [...org.sameAs, ...socialKeys.map((k) => contact.socials[k]).filter(Boolean)],
        }),
        websiteJsonLd({ origin, name: general.agencyName, searchPath: "/buy" }),
      ])}
    />
  );
}
