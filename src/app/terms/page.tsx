import type { Metadata } from "next";
import { SITE } from "@/config/site";
import { TermsPage } from "@/features/terms/TermsPage";

export const metadata: Metadata = {
  title: `Terms & Conditions — ${SITE.name}`,
  description: "The terms that apply when you use The Tentact — written in plain language.",
};

export default function Page() {
  return <TermsPage />;
}
