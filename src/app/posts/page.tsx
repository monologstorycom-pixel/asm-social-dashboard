import { Suspense } from "react";
import PostsClient from "./posts-client";

export default function PostsPage() { return <Suspense fallback={<div className="route-loading">Memuat postingan…</div>}><PostsClient /></Suspense>; }
