import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE } from "@/config/site";
import { HomePage } from "@/features/home/HomePage";
import {
  organizationSchema,
  schemaGraph,
  softwareApplicationSchema,
  webPageSchema,
  webSiteSchema,
} from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          webSiteSchema(),
          webPageSchema({ path: "/", name: `${SITE.name} — ${SITE.tagline}`, description: SITE.description }),
          softwareApplicationSchema(),
        )}
      />
      <HomePage />
    </>
  );
}
