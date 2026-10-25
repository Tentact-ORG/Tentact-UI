import Image from "next/image";
import { SITE } from "@/config/site";
import styles from "./BrandPanel.module.css";

/**
 * The sign-in page's visual half: the people Tentact finds (an illustrated
 * crowd), with cards for what the workspace does — describe who you want,
 * get matched leads with verified contact details — and the secure sign-in.
 */
export function BrandPanel() {
  return (
    <aside className={styles.visual} aria-label={`${SITE.name}: ${SITE.tagline}`}>
      <div className={styles.top}>
        <p className={styles.headline}>
          420M+ verified people.
          <br />
          <em>One search away.</em>
        </p>
        <div className={`${styles.card} ${styles.prompt}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" fill="currentColor" />
          </svg>
          <span>Heads of marketing in London</span>
          <i className={styles.caret} />
        </div>
      </div>

      <Image
        className={styles.people}
        src="/assets/auth/people.png"
        alt=""
        width={1024}
        height={1066}
        sizes="(max-width: 900px) 100vw, 50vw"
        priority
      />

      <div className={styles.cards} aria-hidden="true">
        <div className={`${styles.card} ${styles.lead}`}>
          <small>Lead</small>
          <b>Maya Rao</b>
          <span>VP Marketing · London</span>
          <em>✓ verified email</em>
        </div>

        <div className={`${styles.card} ${styles.secure}`}>
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z" fill="currentColor" />
          </svg>
          <span>Private workspace · secure sign-in</span>
        </div>
      </div>
    </aside>
  );
}
