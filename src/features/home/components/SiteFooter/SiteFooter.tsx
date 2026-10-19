import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { buildSalesMailto, SITE } from "@/config/site";
import { FOOTER_LEGAL_LINKS, FOOTER_PRIMARY_LINKS } from "../../data/navigation";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        <div className={styles.links}>
          {FOOTER_PRIMARY_LINKS.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
        <div className={styles.links}>
          <a className={styles.email} href={buildSalesMailto()}>
            {SITE.salesEmail}
          </a>
          {FOOTER_LEGAL_LINKS.map((link) => (
            <Link key={link.label} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.brand}>
        <BrandMark size={230} className={styles.mark} />
        <div className={styles.wordmark}>
          The <em>Tentact</em>
        </div>
      </div>

      <div className={`${styles.bottom} micro`}>
        <span>© {SITE.copyrightYear} The Tentact</span>
        <span>{SITE.tagline}</span>
      </div>
    </footer>
  );
}
