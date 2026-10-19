import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Button.module.css";

export type ButtonVariant = "red" | "ink" | "line" | "glass" | "frosted";

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant: ButtonVariant;
  /** Appends the animated → arrow used on primary calls to action. */
  withArrow?: boolean;
  children: ReactNode;
}

/**
 * A link styled as a button. Internal routes ("/terms") go through Next's
 * client-side router; hashes, mailto and external URLs render a plain anchor.
 */
export function ButtonLink({ href, variant, withArrow, className, children, ...rest }: ButtonLinkProps) {
  const classes = cx(styles.btn, styles[variant], className);
  const content = (
    <>
      {children}
      {withArrow && <span className={styles.arrow}>→</span>}
    </>
  );

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} className={classes} {...rest}>
      {content}
    </a>
  );
}
