import { Suspense } from "react";
import CompareClient from "./compare-client";

export default function ComparePage() { return <Suspense fallback={<div className="route-loading">Memuat perbandingan…</div>}><CompareClient /></Suspense>; }
