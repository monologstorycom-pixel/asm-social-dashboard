"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Overview", icon: "⌁" },
  { href: "/posts", label: "Posts", icon: "▦" },
  { href: "/compare", label: "Compare", icon: "⇄" },
  { href: "/content-plan", label: "Content Plan", icon: "▤" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand" aria-label="PT Auri Steel Metalindo">
        <span className="brand-mark">ASM</span>
        <span><strong>Command Center</strong><small>Social intelligence</small></span>
      </div>
      <nav aria-label="Primary navigation">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </Link>;
        })}
      </nav>
      <div className="sidebar-foot"><span className="status-dot" />Data workspace <small>PT Auri Steel Metalindo</small></div>
    </aside>
    <main className="main-content">{children}</main>
  </div>;
}
