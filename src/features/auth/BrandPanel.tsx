import { SITE } from "@/config/site";
import styles from "./BrandPanel.module.css";

interface Person {
  x: number;
  /** Shoulder line; the figure is drawn upwards from here. */
  y: number;
  scale: number;
  skin: string;
  shirt: string;
  hair: string;
  /** Hair shape: short crop, long, bun or none. */
  style: "short" | "long" | "bun" | "none";
}

const SKIN = ["#f3cfb3", "#e2ac86", "#c58a63", "#9a6444", "#6f452d"];
const SHIRT = ["#c9d6ee", "#e6dcc4", "#ddd2f2", "#f6d2bf", "#cfe7d9", "#e3eebd", "#f5cddb"];
const HAIR = ["#2b1d16", "#5a3a26", "#1a1a1c", "#8a5a34", "#3b2a20"];
const STYLES: Person["style"][] = ["short", "long", "bun", "short", "none", "long"];

/** Three rows of people, back to front; the match stands in the middle of the front row. */
function crowd(): Person[] {
  const rows = [
    { y: 300, scale: 0.62, xs: [70, 160, 250, 340, 430, 520] },
    { y: 420, scale: 0.8, xs: [40, 150, 360, 470, 575] },
    { y: 560, scale: 1, xs: [95, 505] },
  ];
  let n = 0;
  return rows.flatMap((row) =>
    row.xs.map((x) => {
      n += 1;
      return { x, y: row.y, scale: row.scale, skin: SKIN[(n * 3) % 5], shirt: SHIRT[n % 7], hair: HAIR[(n * 2) % 5], style: STYLES[n % 6] };
    }),
  );
}

const MATCH: Person = { x: 300, y: 560, scale: 1.04, skin: "#c58a63", shirt: "#ff4a1c", hair: "#1a1a1c", style: "long" };

function Figure({ person, className }: { person: Person; className?: string }) {
  const { x, y, scale: s, skin, shirt, hair, style } = person;
  const headY = y - 112 * s;
  const r = 32 * s;
  return (
    <g className={className}>
      {style === "long" && <path d={`M${x - r * 1.08} ${headY} q0 ${-r * 1.25} ${r * 1.08} ${-r * 1.25} q${r * 1.08} 0 ${r * 1.08} ${r * 1.25} v${r * 1.5} h${-r * 2.16} z`} fill={hair} />}
      <path
        d={`M${x - 70 * s} ${y + 40 * s} C${x - 70 * s} ${y - 40 * s} ${x - 44 * s} ${y - 62 * s} ${x} ${y - 62 * s} C${x + 44 * s} ${y - 62 * s} ${x + 70 * s} ${y - 40 * s} ${x + 70 * s} ${y + 40 * s} Z`}
        fill={shirt}
      />
      <rect x={x - 11 * s} y={headY + r * 0.6} width={22 * s} height={30 * s} rx={8 * s} fill={skin} />
      <circle cx={x} cy={headY} r={r} fill={skin} />
      <g fill="#2a1d18">
        <circle cx={x - r * 0.33} cy={headY + r * 0.08} r={r * 0.08} />
        <circle cx={x + r * 0.33} cy={headY + r * 0.08} r={r * 0.08} />
      </g>
      <path d={`M${x - r * 0.26} ${headY + r * 0.38} q${r * 0.26} ${r * 0.22} ${r * 0.52} 0`} fill="none" stroke="#2a1d18" strokeWidth={r * 0.07} strokeLinecap="round" />
      {style === "short" && <path d={`M${x - r} ${headY - r * 0.1} a${r} ${r} 0 0 1 ${r * 2} 0 q${-r * 0.9} ${-r * 0.45} ${-r * 2} 0 z`} fill={hair} />}
      {style === "long" && <path d={`M${x - r} ${headY} a${r} ${r} 0 0 1 ${r * 2} 0 q${-r} ${-r * 0.55} ${-r * 2} 0 z`} fill={hair} />}
      {style === "bun" && (
        <>
          <circle cx={x} cy={headY - r * 1.05} r={r * 0.42} fill={hair} />
          <path d={`M${x - r} ${headY - r * 0.05} a${r} ${r} 0 0 1 ${r * 2} 0 q${-r} ${-r * 0.5} ${-r * 2} 0 z`} fill={hair} />
        </>
      )}
    </g>
  );
}

/**
 * The sign-in page's visual half, drawn in SVG: a crowd of people, one of
 * them picked out by the search's spotlight with their lead card — what the
 * workspace does — and a note that it's a private, secure sign-in.
 */
export function BrandPanel() {
  const people = crowd();
  const headY = MATCH.y - 112 * MATCH.scale;
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
          <span>VP Marketing in London</span>
          <i className={styles.caret} />
        </div>
      </div>

      <svg className={styles.scene} viewBox="0 150 640 450" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <defs>
          <linearGradient id="brand-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6c9" stopOpacity="0" />
            <stop offset="1" stopColor="#fff1a8" stopOpacity="0.85" />
          </linearGradient>
          <radialGradient id="brand-pool">
            <stop offset="0" stopColor="#fff3b0" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff3b0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {people.filter((p) => p.y < 560).map((person, i) => (
          <Figure key={i} person={person} className={person.y === 300 ? styles.back : styles.middle} />
        ))}

        {/* The search's spotlight comes down on the match. */}
        <path className={styles.beam} d={`M270 0 L330 0 L${MATCH.x + 120} ${MATCH.y + 40} L${MATCH.x - 120} ${MATCH.y + 40} Z`} fill="url(#brand-beam)" />
        <ellipse className={styles.beam} cx={MATCH.x} cy={MATCH.y + 34} rx="150" ry="26" fill="url(#brand-pool)" />

        {people.filter((p) => p.y === 560).map((person, i) => (
          <Figure key={i} person={person} className={styles.front} />
        ))}
        <circle className={styles.pulse} cx={MATCH.x} cy={headY} r={52} />
        <Figure person={MATCH} />

        {/* The match's lead card, tied to them. */}
        <path className={styles.tie} d={`M${MATCH.x + 40} ${headY - 10} C${MATCH.x + 90} ${headY - 40} ${MATCH.x + 110} ${headY - 70} ${MATCH.x + 140} ${headY - 78}`} />
        <g className={styles.leadCard} transform={`translate(${MATCH.x + 128} ${headY - 150}) rotate(3)`}>
          <rect width="176" height="98" rx="14" fill="#fff" />
          <text x="16" y="26" className={styles.leadLabel}>MATCH</text>
          <text x="16" y="48" className={styles.leadName}>Maya Rao</text>
          <text x="16" y="66" className={styles.leadRole}>VP Marketing · London</text>
          <text x="16" y="86" className={styles.leadVerified}>✓ verified email</text>
        </g>
      </svg>

      <div className={`${styles.card} ${styles.secure}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z" fill="currentColor" />
        </svg>
        <span>Private workspace · secure sign-in</span>
      </div>
    </aside>
  );
}
