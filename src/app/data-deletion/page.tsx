import type { Metadata } from "next";
import LegalDocument, { PRIVACY_EMAIL } from "../legal-document";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | Staff Sosmed ASM",
  description: "Instructions for requesting deletion of data associated with Staff Sosmed ASM, operated by PT Auri Steel Metalindo.",
};

const list = (items: string[]) => <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;

export default function DataDeletionPage() {
  return <LegalDocument title="Data Deletion Instructions" subtitle="Staff Sosmed ASM — PT Auri Steel Metalindo" alternate={{ href: "/privacy", label: "Privacy Policy" }} sections={[
    { title: "How to Request Data Deletion", content: <><p>Users and authorized account owners may request deletion of data associated with Staff Sosmed ASM.</p><p>Send a data deletion request to:</p><p><a href={`mailto:${PRIVACY_EMAIL}`}><strong>{PRIVACY_EMAIL}</strong></a></p><p>Include:</p>{list(["your name;","the Facebook Page or Instagram Business account related to the request;","a brief description of the data you want deleted;","sufficient information for PT Auri Steel Metalindo to verify that you are authorized to make the request."])}</> },
    { title: "What Happens After a Request", content: <><p>After receiving a valid request, PT Auri Steel Metalindo will:</p>{list(["verify the request and the requester’s authority where necessary;","identify data associated with the relevant account or application usage;","delete, anonymize, or otherwise remove eligible data from Staff Sosmed ASM systems;","retain information only where required for legitimate security, legal, audit, or compliance purposes."])}<p>Requests will be processed within a reasonable period consistent with applicable requirements.</p></> },
    { title: "Revoking Meta Access", content: <><p>Authorized account administrators may also revoke Staff Sosmed ASM&apos;s access through their Meta/Facebook business or application settings.</p><p>Revoking access prevents the application from making future authorized API requests but may not automatically delete information already stored by the application.</p><p>To request deletion of stored information, use the deletion process described above.</p></> },
    { title: "Contact", content: <><p><strong>PT Auri Steel Metalindo</strong></p><p>Data deletion contact: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a></p></> },
  ]} />;
}
