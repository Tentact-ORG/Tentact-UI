import { absoluteUrl } from "@/config/seo";
import { SITE } from "@/config/site";
import { INCLUDED_FEATURES, PRICING } from "@/features/home/sections/pricing/pricing.data";

/**
 * schema.org builders. Every value here restates something already published
 * on the site (name, contact, pricing, included features); nothing is added
 * for search engines that a visitor could not read on the page.
 */

const SCHEMA_CONTEXT = "https://schema.org";

function organizationId(): string {
  return `${absoluteUrl("/")}#organization`;
}

function webSiteId(): string {
  return `${absoluteUrl("/")}#website`;
}

export function organizationSchema(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": organizationId(),
    name: SITE.name,
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/assets/logo/tentact-block-512.png"),
      width: 512,
      height: 512,
    },
    email: SITE.salesEmail,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: SITE.salesEmail,
        availableLanguage: ["English"],
      },
    ],
  };
}

export function webSiteSchema(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": webSiteId(),
    url: absoluteUrl("/"),
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en",
    publisher: { "@id": organizationId() },
  };
}

export function softwareApplicationSchema(): Record<string, unknown> {
  return {
    "@type": "SoftwareApplication",
    name: SITE.name,
    url: absoluteUrl("/"),
    description: SITE.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    featureList: [...INCLUDED_FEATURES],
    offers: {
      "@type": "Offer",
      name: "One plan, festive price",
      price: PRICING.festivePrice,
      priceCurrency: "USD",
      url: absoluteUrl("/#pricing"),
      availability: "https://schema.org/InStock",
      seller: { "@id": organizationId() },
    },
    provider: { "@id": organizationId() },
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: readonly BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webPageSchema(input: { path: string; name: string; description: string }): Record<string, unknown> {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(input.path)}#webpage`,
    url: absoluteUrl(input.path),
    name: input.name,
    description: input.description,
    inLanguage: "en",
    isPartOf: { "@id": webSiteId() },
    about: { "@id": organizationId() },
  };
}

/** Wraps several schema objects in one JSON-LD document. */
export function schemaGraph(...nodes: Record<string, unknown>[]): Record<string, unknown> {
  return { "@context": SCHEMA_CONTEXT, "@graph": nodes };
}
