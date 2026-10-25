import { SITE } from "@/config/site";
import { BrandMivy } from "./BrandMivy";
import styles from "./BrandPanel.module.css";

/**
 * The sign-in page's visual half: glossy, playful 3D-style shapes drawn in
 * CSS, floating slowly around Mivy, the site's assistant, who says hi.
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

        <BrandMivy />
      </div>
    </aside>
  );
}
