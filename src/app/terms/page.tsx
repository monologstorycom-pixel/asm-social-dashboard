import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument, { PRIVACY_EMAIL } from "../legal-document";

export const metadata: Metadata = {
  title: "Terms of Service | Staff Sosmed ASM",
  description: "Ketentuan penggunaan Staff Sosmed ASM, aplikasi internal PT Auri Steel Metalindo untuk pengelolaan media sosial perusahaan.",
};

const list = (items: string[]) => <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;

export default function TermsPage() {
  return <LegalDocument title="Terms of Service" subtitle="Staff Sosmed ASM — PT Auri Steel Metalindo" alternate={{ href: "/privacy", label: "Privacy Policy" }} sections={[
    { title: "Tentang Aplikasi", content: <><p>Staff Sosmed ASM adalah aplikasi internal PT Auri Steel Metalindo untuk pengelolaan, approval, publikasi, dan analitik media sosial perusahaan.</p><p>Aplikasi hanya digunakan oleh personel dan sistem yang telah diberi otorisasi.</p></> },
    { title: "Ketentuan yang Berlaku", content: <><p>Penggunaan aplikasi tunduk pada:</p>{list(["kebijakan internal PT Auri Steel Metalindo;","ketentuan Meta Platforms yang berlaku;","izin akun Facebook Page dan Instagram Business yang diberikan kepada aplikasi."])}</> },
    { title: "Larangan Penggunaan", content: <><p>Pengguna dilarang:</p>{list(["menggunakan aplikasi untuk akun yang tidak berwenang;","menyalahgunakan data Meta atau Instagram;","mencoba mengakses credential atau token;","menggunakan aplikasi untuk aktivitas ilegal atau melanggar kebijakan platform."])}</> },
    { title: "Perubahan dan Pembatasan Akses", content: <p>PT Auri Steel Metalindo dapat mengubah, membatasi, atau menghentikan akses aplikasi bila diperlukan untuk keamanan, compliance, atau operasional.</p> },
    { title: "Data dan Privasi", content: <><p>Data dan privasi diatur dalam:</p><p><Link href="/privacy">https://sosmedasm.rsby.cloud/privacy</Link></p><p>Instruksi penghapusan data:</p><p><Link href="/data-deletion">https://sosmedasm.rsby.cloud/data-deletion</Link></p></> },
    { title: "Contact", content: <><p><strong>PT Auri Steel Metalindo</strong></p><p>Email: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a></p></> },
  ]} />;
}
