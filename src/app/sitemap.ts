import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/config/seo";
import { ROUTES } from "@/config/site";
import { TERMS_META } from "@/features/terms/terms.data";

/**
 * Only the public marketing pages are listed. `/login` and the dashboard under
 * `/home` are private and carry `noindex`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl(ROUTES.home),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: absoluteUrl(ROUTES.terms),
      lastModified: new Date(TERMS_META.lastUpdatedIso),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
