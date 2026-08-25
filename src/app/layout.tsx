import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import AppShell from "./app-shell";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ASM Pusat Komando",
  description: "Dashboard analitik media sosial — PT Auri Steel Metalindo",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id" className={`${outfit.variable} ${geistMono.variable}`}><body><AppShell>{children}</AppShell></body></html>;
}
