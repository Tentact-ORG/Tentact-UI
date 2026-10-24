import type { CSSProperties } from "react";
import { SITE } from "@/config/site";
import styles from "./BrandPanel.module.css";

const PETALS = 14;

/**
 * The sign-in page's visual half: glossy, playful 3D-style shapes drawn
 * entirely in CSS (no image files), floating slowly around a friendly flower.
 */
export function BrandPanel() {
  return (
    <aside className={styles.visual} aria-label={`${SITE.name}: ${SITE.tagline}`}>
      <div className={styles.scene} aria-hidden="true">
        <span className={`${styles.shape} ${styles.striped}`} />
        <span className={`${styles.shape} ${styles.blue}`} />
        <span className={`${styles.shape} ${styles.glass} ${styles.glassTop}`} />
        <span className={`${styles.shape} ${styles.pearl}`} />
        <span className={`${styles.shape} ${styles.glass} ${styles.glassLeft}`} />
        <span className={`${styles.shape} ${styles.donut}`} />
        <span className={`${styles.shape} ${styles.blob}`} />
        <span className={`${styles.shape} ${styles.violet}`} />
        <span className={`${styles.shape} ${styles.glass} ${styles.glassRight}`} />
        <span className={`${styles.shape} ${styles.pyramid}`} />

        <div className={styles.flower}>
          <div className={styles.petals}>
            {Array.from({ length: PETALS }, (_, i) => (
              <i key={i} style={{ "--i": i, "--n": PETALS } as CSSProperties} />
            ))}
          </div>
          <div className={styles.face}>
            <b className={styles.eye} />
            <b className={styles.eye} />
            <b className={styles.nose} />
          </div>
        </div>
      </div>
    </aside>
  );
}
