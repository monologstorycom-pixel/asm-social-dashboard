import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import AppShell from "./app-shell";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "ASM Pusat Komando",
  description: "Dashboard analitik media sosial — PT Auri Steel Metalindo",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id" className={`${dmSans.variable} ${jetbrainsMono.variable}`}><body><AppShell>{children}</AppShell></body></html>;
}
