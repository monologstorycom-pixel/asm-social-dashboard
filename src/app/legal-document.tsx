import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

export const PRIVACY_EMAIL = "sales@auristeel.com";

type Section = { title: string; content: ReactNode };

export default function LegalDocument({ title, subtitle, updated, sections, alternate }: {
  title: string;
  subtitle: string;
  updated?: string;
  sections: Section[];
  alternate: { href: string; label: string };
}) {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/privacy" aria-label="PT Auri Steel Metalindo — Privacy Policy">
        <Image src="/auri-steel-logo.png" width={300} height={38} alt="PT Auri Steel Metalindo" priority className={styles.logo} />
      </Link>
      <span className={styles.badge}>Staff Sosmed ASM</span>
    </header>
    <main className={styles.document}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>PT Auri Steel Metalindo</p>
        <h1>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        {updated && <p className={styles.updated}>{updated}</p>}
      </div>
      <article>
        {sections.map((section, index) => <section key={section.title} className={styles.section}>
          <h2>{index + 1}. {section.title}</h2>
          <div className={styles.copy}>{section.content}</div>
        </section>)}
      </article>
      <nav className={styles.crossLink} aria-label="Related legal information">
        <span>Related information</span>
        <Link href={alternate.href}>{alternate.label} <span aria-hidden="true">→</span></Link>
      </nav>
    </main>
    <footer className={styles.footer}>© 2026 PT Auri Steel Metalindo. All rights reserved.</footer>
  </div>;
}
