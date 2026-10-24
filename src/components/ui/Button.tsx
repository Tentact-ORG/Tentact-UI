import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./Button.module.css";
import type { ButtonVariant } from "./ButtonLink";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ButtonVariant;
  /** Stretches to the container's width. */
  block?: boolean;
  /** Disables the button and announces busy state while an action runs. */
  loading?: boolean;
  /** Appends the animated → arrow used on primary calls to action. */
  withArrow?: boolean;
  children: ReactNode;
}

/** A real `<button>`, styled like `ButtonLink`. Defaults to `type="button"`. */
export function Button({
  variant,
  block,
  loading,
  withArrow,
  className,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.btn, styles[variant], block && styles.block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
      {withArrow && <span className={styles.arrow}>→</span>}
    </button>
  );
}
