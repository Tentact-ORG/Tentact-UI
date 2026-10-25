import { SITE } from "@/config/site";
import styles from "./BrandPanel.module.css";

/**
 * The block mark's letters (from public/assets/logo/tentact-block-mark.svg):
 * each letter's slabs, the thin cuts through it, and its folded-paper shadows,
 * so the letters can arrive one at a time and end as the exact logo.
 */
const LETTERS: { slabs: number[][]; cuts?: number[][]; folds?: string[] }[] = [
  { slabs: [[0, 0, 148, 48], [30, 53, 118, 117]], folds: ["30,53 148,53 148,58 30,74"] },
  { slabs: [[153, 0, 148, 170]], cuts: [[205, 55, 96, 5], [205, 112, 96, 5]], folds: ["205,60 301,60 301,64 205,76"] },
  { slabs: [[306, 0, 148, 170]], cuts: [[356, 50, 5, 120], [399, 0, 5, 120]] },
  { slabs: [[30, 175, 110, 48], [55, 228, 60, 117]] },
  { slabs: [[145, 175, 110, 170]], cuts: [[197, 215, 6, 42], [197, 290, 6, 55]], folds: ["145,175 370,175 370,180 145,198"] },
  { slabs: [[260, 175, 110, 46], [260, 226, 42, 68], [260, 299, 110, 46]], folds: ["145,175 370,175 370,180 145,198"] },
  { slabs: [[375, 175, 110, 48], [375, 228, 72, 117]], folds: ["375,228 447,228 447,248 375,233"] },
];

const rect = ([x, y, width, height]: number[], key: number, fill: string) => <rect key={key} x={x} y={y} width={width} height={height} fill={fill} />;

/** The Tentact block mark, building itself: the tile, then T-E-N-T-A-C-T, then a light sweep. */
function AnimatedLogo() {
  return (
    <svg className={styles.logo} viewBox="0 0 600 600" role="img" aria-label={SITE.name}>
      <defs>
        <filter id="logo-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 .9" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <linearGradient id="logo-fold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".2" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="logo-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="logo-tile">
          <rect width="600" height="600" rx="112" />
        </clipPath>
        {LETTERS.map((letter, i) => (
          <mask key={i} id={`logo-letter-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="485" height="345">
            {letter.slabs.map((slab, j) => rect(slab, j, "#fff"))}
            {letter.cuts?.map((cut, j) => rect(cut, 100 + j, "#000"))}
          </mask>
        ))}
      </defs>

      <g className={styles.tile}>
        <rect width="600" height="600" rx="112" fill="#D9191F" />
        <rect width="600" height="600" rx="112" fill="#D9191F" filter="url(#logo-grain)" opacity=".22" />
      </g>

      <g transform="translate(90 150.6) scale(.866)">
        {LETTERS.map((letter, i) => (
          <g key={i} className={styles.letter} style={{ animationDelay: `${520 + i * 120}ms` }}>
            <g mask={`url(#logo-letter-${i})`}>
              <rect width="485" height="345" fill="#ECEBE8" />
              {letter.folds?.map((points) => <polygon key={points} points={points} fill="url(#logo-fold)" />)}
              <rect width="485" height="345" fill="#fff" filter="url(#logo-grain)" opacity=".16" />
            </g>
          </g>
        ))}
      </g>

      <g clipPath="url(#logo-tile)">
        <rect className={styles.sheen} x="-260" y="-100" width="220" height="800" fill="url(#logo-sheen)" />
      </g>
    </svg>
  );
}

/** The sign-in page's visual half: the Tentact logo assembling itself, above the tagline. */
export function BrandPanel() {
  return (
    <aside className={styles.visual}>
      <div className={styles.stage}>
        <AnimatedLogo />
        <p className={styles.tagline}>
          Sales data <em>for people who sell.</em>
        </p>
      </div>
    </aside>
  );
}
