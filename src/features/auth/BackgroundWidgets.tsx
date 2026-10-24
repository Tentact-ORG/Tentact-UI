import styles from "./BackgroundWidgets.module.css";

interface Widget {
  id: string;
  label: string;
  value: string;
  note?: string;
  tone: "plain" | "red" | "yellow" | "ink" | "mint" | "sky";
}

/** The same kinds of records the landing page shows, drifting slowly behind the sign-in card. */
const WIDGETS: readonly Widget[] = [
  { id: "database", label: "Database", value: "420M+", note: "verified data", tone: "red" },
  { id: "lead", label: "Lead", value: "Maya Rao", note: "✓ verified email", tone: "plain" },
  { id: "signal", label: "Signal", value: "New role · 32 days", note: "Head of Growth", tone: "yellow" },
  { id: "icp", label: "ICP match", value: "SaaS · 50–500", note: "fits your profile", tone: "ink" },
  { id: "dial", label: "Direct dial", value: "+1 415 ••• 018", note: "✓ valid phone", tone: "mint" },
  { id: "export", label: "Export", value: "↓ buyers.csv", note: "1,240 rows", tone: "sky" },
  { id: "intent", label: "Intent", value: "High", note: "attribution", tone: "plain" },
  { id: "hiring", label: "Hiring", value: "4 SDRs", note: "this month", tone: "yellow" },
];

/** Decorative only: hidden from assistive technology and frozen when reduced motion is preferred. */
export function BackgroundWidgets() {
  return (
    <div className={styles.layer} aria-hidden="true">
      {WIDGETS.map((widget) => (
        <div key={widget.id} className={styles.widget} data-slot={widget.id} data-tone={widget.tone}>
          <span className={styles.label}>{widget.label}</span>
          <span className={styles.value}>{widget.value}</span>
          {widget.note && <span className={styles.note}>{widget.note}</span>}
        </div>
      ))}
    </div>
  );
}
