import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/config/seo";

/**
 * The dashboard is blocked by path. `/login` stays crawlable on purpose so
 * crawlers can read its `noindex` tag; blocking it would let the bare URL be
 * indexed from the landing page's "Sign in" link.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/home", "/credits", "/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
