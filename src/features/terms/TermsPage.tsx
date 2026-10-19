import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { buildSalesMailto, ROUTES, SITE } from "@/config/site";
import { cx } from "@/lib/cx";
import { BackToTop } from "./components/BackToTop";
import { ReadingProgress } from "./components/ReadingProgress";
import { RevealOnScroll } from "./components/RevealOnScroll";
import { TableOfContents } from "./components/TableOfContents";
import { GLANCE_CARDS, TERMS_META, TERMS_SECTIONS } from "./terms.data";
import styles from "./TermsPage.module.css";

const CARD_STAGGER_MS = 70;

function TermsNav() {
  return (
    <header className={styles.nav}>
      <Link className={styles.brand} href={ROUTES.home}>
        <BrandMark size={36} className={styles.brandMark} />
        <span>
          The <em>Tentact</em>
        </span>
      </Link>
      <div className={styles.navActions}>
        <ButtonLink variant="frosted" className={cx(styles.termsButton, styles.backLink)} href={ROUTES.home}>
          ← Back to site
        </ButtonLink>
        <ButtonLink variant="red" className={styles.termsButton} href={buildSalesMailto()}>
          Contact us
        </ButtonLink>
      </div>
    </header>
  );
}

function TermsHero() {
  return (
    <header className={styles.hero}>
      <div className={cx(styles.crumb, "micro")}>
        <Link href={ROUTES.home}>The Tentact</Link> &nbsp;/&nbsp; Legal &nbsp;/&nbsp; Terms
      </div>
      <h1>
        Terms &amp; <em>Conditions.</em>
      </h1>
      <div className={styles.intro}>
        <p>
          These are the rules for using The Tentact. We&apos;ve written them in plain language and put a short summary
          at the top of every section — but the full text is what counts.
        </p>
        <div className={styles.meta}>
          <span className={styles.chip}>
            <i />
            Last updated <b>{TERMS_META.lastUpdated}</b>
          </span>
          <span className={styles.chip}>{TERMS_META.readingTime}</span>
        </div>
      </div>
    </header>
  );
}

function TermsGlance() {
  return (
    <section className={styles.glance}>
      <h2>The key points, at a glance</h2>
      <div className={styles.cards}>
        {GLANCE_CARDS.map((card, index) => (
          <RevealOnScroll
            key={card.title}
            className={styles.card}
            style={{ background: card.background }}
            delayMs={index * CARD_STAGGER_MS}
          >
            <span className={styles.cardIcon}>{card.icon}</span>
            <div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}

function HelpCard() {
  return (
    <div className={styles.help}>
      <b>Need a hand?</b>
      <p>If anything here is unclear, ask us before you sign up — we&apos;re happy to explain.</p>
      <a href={buildSalesMailto()}>{SITE.salesEmail} →</a>
    </div>
  );
}

function TermsArticle() {
  return (
    <article className={styles.article} id="terms">
      {TERMS_SECTIONS.map((section, index) => (
        <RevealOnScroll as="section" key={section.id} id={section.id}>
          <div className={styles.number}>{String(index + 1).padStart(2, "0")}</div>
          <h2>{section.title}</h2>
          <div className={styles.summary}>
            <b>In short</b>
            <span>{section.summary}</span>
          </div>
          {section.content}
        </RevealOnScroll>
      ))}
    </article>
  );
}

function TermsFooter() {
  return (
    <footer className={styles.footer}>
      <span>
        © {SITE.copyrightYear} The Tentact · {SITE.tagline}
      </span>
      <div className={styles.footerLinks}>
        <Link href={ROUTES.home}>Home</Link>
        <Link href={ROUTES.pricing}>Pricing</Link>
        <Link href={ROUTES.terms}>Terms</Link>
        <Link href={ROUTES.privacy}>Privacy</Link>
        <a href={buildSalesMailto()}>Contact</a>
      </div>
    </footer>
  );
}

/** Terms & Conditions: plain-language summaries, a sticky contents list and the full text. */
export function TermsPage() {
  const tocEntries = TERMS_SECTIONS.map(({ id, title }) => ({ id, title }));

  return (
    <div className={styles.page}>
      <ReadingProgress />
      <TermsNav />
      <TermsHero />
      <TermsGlance />

      <div className={styles.layout}>
        <aside className={styles.aside}>
          <TableOfContents entries={tocEntries} />
          <HelpCard />
        </aside>
        <TermsArticle />
      </div>

      <TermsFooter />
      <BackToTop />
    </div>
  );
}
