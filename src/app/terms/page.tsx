import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { ROUTES, SITE } from "@/config/site";
import { TermsPage } from "@/features/terms/TermsPage";
import { breadcrumbSchema, schemaGraph, webPageSchema } from "@/lib/seo/structured-data";

const TITLE = "Terms & Conditions";
const DESCRIPTION = `The terms that apply when you use ${SITE.name}: what the service provides, pricing, how the data may be used, privacy, accuracy and liability, written in plain language.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.terms },
  openGraph: { url: ROUTES.terms, title: `${TITLE} — ${SITE.name}`, description: DESCRIPTION },
  twitter: { title: `${TITLE} — ${SITE.name}`, description: DESCRIPTION },
};

export default function Page() {
  return (
    <>
      <JsonLd
        data={schemaGraph(
          webPageSchema({ path: ROUTES.terms, name: `${TITLE} — ${SITE.name}`, description: DESCRIPTION }),
          breadcrumbSchema([
            { name: SITE.name, path: ROUTES.home },
            { name: TITLE, path: ROUTES.terms },
          ]),
        )}
      />
      <TermsPage />
    </>
  );
}
