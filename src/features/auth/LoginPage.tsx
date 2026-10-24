import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { buildSalesMailto, ROUTES, SITE } from "@/config/site";
import { BackgroundWidgets } from "./BackgroundWidgets";
import { BrandPanel } from "./BrandPanel";
import { LoginForm } from "./LoginForm";
import styles from "./LoginPage.module.css";

interface LoginPageProps {
  authConfigured: boolean;
}

/** Sign-in: the brand visual on one side, the form on the other. */
export function LoginPage({ authConfigured }: LoginPageProps) {
  return (
    <main className={styles.page}>
      <BackgroundWidgets />
      <div className={styles.card}>
        <BrandPanel />

        <section className={styles.formSide} aria-labelledby="login-title">
          <div className={styles.formInner}>
            <Link href={ROUTES.home} className={styles.brand}>
              <BrandMark size={28} />
              <span>
                The <em>Tentact</em>
              </span>
            </Link>

            <h1 id="login-title" className={styles.title}>
              Welcome back.
            </h1>
            <p className={styles.subtitle}>Sign in to your Tentact workspace.</p>

            <LoginForm authConfigured={authConfigured} />

            <p className={styles.footnote}>
              Don&apos;t have access yet?{" "}
              <a href={buildSalesMailto("Access to The Tentact")}>Talk to sales</a>
              <span aria-hidden="true"> · </span>
              <Link href={ROUTES.terms}>Terms</Link>
            </p>
          </div>
        </section>
      </div>
      <p className={styles.colophon}>
        © {SITE.copyrightYear} {SITE.name}
      </p>
    </main>
  );
}
