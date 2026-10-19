import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { buildSalesMailto, SITE } from "@/config/site";
import { cx } from "@/lib/cx";
import styles from "./TermsPage.module.css";

export const TERMS_META = {
  lastUpdated: "18 October 2026",
  readingTime: "≈ 10 min read",
} as const;

export interface GlanceCard {
  icon: string;
  title: string;
  description: string;
  background: string;
}

export const GLANCE_CARDS: readonly GlanceCard[] = [
  {
    icon: "✓",
    title: "Verified, ICP-based data",
    description: "We supply B2B contact data matched to your ideal customer profile and check it before delivery.",
    background: "var(--mint)",
  },
  {
    icon: "⚖",
    title: "Use it lawfully",
    description: "You're responsible for following privacy, anti-spam and marketing laws when you contact people.",
    background: "var(--yellow)",
  },
  {
    icon: "$",
    title: "Clear pricing",
    description: "One plan. Base price $4,000; festive offer $3,500; 10% off when you apply.",
    background: "#ffe0cf",
  },
  {
    icon: "✉",
    title: "Real people to talk to",
    description: `Questions about these terms? Write to ${SITE.salesEmail}.`,
    background: "#e7ddfb",
  },
];

export interface TermsSection {
  id: string;
  title: string;
  summary: string;
  content: ReactNode;
}

/** The terms, in order. Section numbers and the table of contents are derived from this list. */
export const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    id: "about",
    title: "About these terms",
    summary: "By using The Tentact you agree to these terms. If you're signing up for a company, you're agreeing on its behalf.",
    content: (
      <>
        <p>
          These Terms &amp; Conditions (&quot;Terms&quot;) are an agreement between you and The Tentact (&quot;we&quot;,
          &quot;us&quot;, &quot;our&quot;), the operator of the website and service known as The Tentact (the
          &quot;Service&quot;).
        </p>
        <p>
          By creating an account, placing an order or otherwise using the Service, you confirm that you have read and
          accept these Terms. If you use the Service on behalf of a business, you confirm that you are authorised to
          accept these Terms for that business, and &quot;you&quot; means that business.
        </p>
        <p>If you do not agree with these Terms, please do not use the Service.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "What we provide",
    summary:
      "Verified B2B contact data from a database of 420+ million data records, filtered to the ideal customer profile you describe.",
    content: (
      <>
        <p>
          The Tentact provides business-to-business (&quot;B2B&quot;) contact and company data to help sales and
          marketing teams find potential customers. This includes:
        </p>
        <ul>
          <li>Access to a database of more than 420 million business data records;</li>
          <li>
            Lists built on your ideal customer profile (&quot;ICP&quot;) — for example by role, industry, company size,
            location or buying signals;
          </li>
          <li>Contact details such as work email addresses and phone numbers, which we verify before delivery;</li>
          <li>Company information and signals such as job changes, hiring activity and technology used;</li>
          <li>Export of your data to CSV or to your CRM.</li>
        </ul>
        <p>
          We may improve, change or add features over time. If we remove a feature that is central to what you paid
          for, we&apos;ll tell you in advance.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    summary: "Give us accurate details, keep your login safe, and don't share your account.",
    content: (
      <ul>
        <li>You must be at least 18 years old and using the Service for business purposes.</li>
        <li>The information you give us when signing up must be accurate and kept up to date.</li>
        <li>You are responsible for keeping your login details secure and for all activity under your account.</li>
        <li>Accounts are for the individuals or team members named on your plan and may not be shared or resold.</li>
        <li>Tell us straight away at {SITE.salesEmail} if you suspect unauthorised access.</li>
      </ul>
    ),
  },
  {
    id: "pricing",
    title: "Pricing & payment",
    summary: "One plan with clear pricing. Festive and application discounts are applied as shown below.",
    content: (
      <>
        <div className={styles.priceGrid}>
          <div>
            <small>Base price</small>
            <b>$4,000</b>
          </div>
          <div>
            <small>Dasara · Diwali offer</small>
            <b>$3,500</b>
          </div>
          <div className={styles.priceHighlight}>
            <small>With 10% application discount</small>
            <b>$3,150</b>
          </div>
        </div>
        <ul className={styles.listSpaced}>
          <li>
            Prices are in US dollars and exclude applicable taxes (such as GST or VAT), which will be added to your
            invoice where required.
          </li>
          <li>
            The Dasara · Diwali offer is available for a limited period during the festive season. We&apos;ll confirm
            the exact end date in your quote.
          </li>
          <li>
            The 10% application discount applies to the offer price when you apply through our sales team, and is
            applied once per customer.
          </li>
          <li>
            Offers and discounts can&apos;t be exchanged for cash and can&apos;t be combined with other promotions
            unless we say so in writing.
          </li>
          <li>
            Payment is due as set out in your invoice or order form. If a payment is late, we may pause access until
            it&apos;s received.
          </li>
        </ul>
        <p className={styles.note}>
          The billing period for each plan (for example one-time, monthly or annual) and anything else specific to your
          purchase will be confirmed in your order form or invoice. If that document differs from these Terms, the
          order form wins.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How you may use the data",
    summary:
      "Use the data for your own lawful B2B sales and marketing. Don't resell it, spam people or use it to harm anyone.",
    content: (
      <div className={styles.twoColumn}>
        <div className={styles.box}>
          <h4>You may</h4>
          <ul className={styles.listYes}>
            <li>Use the data to find and contact potential business customers</li>
            <li>Import it into your CRM and sales tools</li>
            <li>Share it inside your own company for that purpose</li>
            <li>Keep records you exported while your plan is active</li>
          </ul>
        </div>
        <div className={styles.box}>
          <h4>You may not</h4>
          <ul className={styles.listNo}>
            <li>Resell, license or publish the data, or build a competing database</li>
            <li>Send spam or bulk unsolicited messages that break the law</li>
            <li>Use the data for consumer marketing, credit, employment, insurance or housing decisions</li>
            <li>Harass, discriminate against or stalk any person</li>
            <li>Scrape, copy or reverse-engineer the Service</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "privacy",
    title: "Privacy & data protection",
    summary:
      "Contact data is personal data. When you use it, you must follow the privacy and anti-spam laws that apply to you — and honour opt-outs.",
    content: (
      <>
        <p>
          The contacts in our database are real people, and the data we provide is personal data under laws such as
          India&apos;s Digital Personal Data Protection Act 2023, the EU and UK GDPR, the US CAN-SPAM Act and similar
          laws elsewhere.
        </p>
        <ul>
          <li>
            You are responsible for having a lawful basis to contact the people in your lists and for complying with
            the laws that apply to your outreach.
          </li>
          <li>Every marketing message you send must identify you clearly and give the recipient an easy way to opt out.</li>
          <li>If someone asks you to stop contacting them or to delete their data, you must do so promptly.</li>
          <li>
            If someone asks us to remove their data, we&apos;ll remove it from our database and may ask you to remove it
            from records you&apos;ve exported.
          </li>
          <li>We protect data with appropriate technical and organisational security measures.</li>
        </ul>
        <p>
          How we handle your own account information (for example your name, email and billing details) is described
          in our Privacy Policy. Questions about privacy can be sent to {SITE.salesEmail}.
        </p>
      </>
    ),
  },
  {
    id: "accuracy",
    title: "Data accuracy",
    summary:
      "We verify data before delivery, but people change jobs and emails every day — so no data provider can promise 100% accuracy.",
    content: (
      <>
        <p>
          We work hard to keep our data accurate and verify emails and phone numbers before delivery. However, business
          contact information changes constantly. We therefore cannot guarantee that every record is complete, current
          or error-free, or that any contact will result in a sale.
        </p>
        <p>
          If you find records that are clearly wrong, let us know — we&apos;ll review them and, where appropriate,
          correct or replace them.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "Ownership",
    summary: "We own the Service and the database. You get a licence to use the data you receive under these Terms.",
    content: (
      <>
        <p>
          The Service, our database, software, design, logo and brand belong to us or our licensors. We grant you a
          limited, non-exclusive, non-transferable licence to use the data you receive, only as allowed in section 5 and
          only for as long as your plan permits.
        </p>
        <p>
          Any data or content you upload (for example your own customer lists) remains yours. You give us permission to
          process it only so we can provide the Service to you.
        </p>
      </>
    ),
  },
  {
    id: "cancel",
    title: "Cancellations & refunds",
    summary:
      "Because data is delivered digitally and can't be \"returned\", payments are generally non-refundable — but talk to us if something has gone wrong.",
    content: (
      <ul>
        <li>
          Once data has been delivered or made available to you, payments are non-refundable, except where the law
          requires otherwise or we agree in writing.
        </li>
        <li>If we can&apos;t deliver what you paid for, we&apos;ll fix the problem or offer a fair refund or credit.</li>
        <li>To cancel or discuss a billing issue, email {SITE.salesEmail}.</li>
      </ul>
    ),
  },
  {
    id: "end",
    title: "Suspension & termination",
    summary: "Either side can end the agreement. We may suspend accounts that break these Terms.",
    content: (
      <>
        <p>
          You can stop using the Service at any time. We may suspend or end your access if you seriously or repeatedly
          break these Terms, don&apos;t pay, or use the Service in a way that could harm others or expose us to legal
          risk. Where reasonable, we&apos;ll warn you first and give you a chance to fix the problem.
        </p>
        <p>
          When the agreement ends, your licence to use the data ends too, and you must stop using and delete data that
          you&apos;re no longer permitted to keep. Sections that by their nature should continue (such as ownership,
          liability and governing law) will survive.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    summary:
      "We stand behind our Service, but our total responsibility is limited to what you paid us in the last 12 months.",
    content: (
      <>
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent the law allows,
          we do not give warranties beyond those set out in these Terms.
        </p>
        <p>
          We are not liable for indirect or consequential losses, such as lost profits, lost sales or lost
          opportunities. Our total liability arising from these Terms or the Service is limited to the amount you paid
          us in the 12 months before the claim.
        </p>
        <p>Nothing in these Terms limits liability that cannot be limited by law, such as liability for fraud.</p>
        <p>
          You agree to cover our reasonable losses if a third party makes a claim against us because of how you used
          the data or broke these Terms.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    summary: "We may update these Terms. If a change is important, we'll tell you before it applies.",
    content: (
      <p>
        We may update these Terms from time to time — for example to reflect new features or changes in the law.
        We&apos;ll update the &quot;Last updated&quot; date above, and for significant changes we&apos;ll notify you by
        email at least 14 days before they take effect. If you keep using the Service after that, you accept the
        updated Terms.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    summary:
      "These Terms are governed by the laws of India. We'll always try to resolve disagreements by talking first.",
    content: (
      <>
        <p>
          These Terms are governed by the laws of India. If a dispute arises, we&apos;ll first try to resolve it
          informally by email. If that doesn&apos;t work within 30 days, the courts at [city], India will have exclusive
          jurisdiction.
        </p>
        <p>
          If any part of these Terms is found to be unenforceable, the rest will remain in effect. Our not enforcing a
          right straight away doesn&apos;t mean we give it up.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    summary: "Questions, requests or complaints — one email address reaches us.",
    content: (
      <>
        <p>We read every message and aim to reply within two business days.</p>
        <div className={styles.contactCard}>
          <div>
            <span className="micro">Email</span>
            <br />
            <a className={styles.contactEmail} href={buildSalesMailto()}>
              {SITE.salesEmail}
            </a>
          </div>
          <ButtonLink
            variant="red"
            className={cx(styles.termsButton, styles.contactButton)}
            href={buildSalesMailto("Question about the Terms")}
          >
            Ask a question →
          </ButtonLink>
        </div>
      </>
    ),
  },
];
