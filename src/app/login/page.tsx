"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/";
  return <main className="login-page">
    <form className="login-card login-form" action="/api/auth/login" method="post">
      <div className="login-copy">
        <p className="eyebrow">PT Auri Steel Metalindo</p>
        <h1>Masuk ke dashboard</h1>
        <p className="login-intro">Kelola ringkasan, postingan, dan rencana konten dari sini.</p>
      </div>
      {error === "credentials" ? <p className="form-error login-error">Username atau password salah.</p> : null}
      <input type="hidden" name="next" value={next} />
      <label>
        Username
        <input name="username" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="primary-action" type="submit">Masuk</button>
    </form>
  </main>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="login-page" />}><LoginForm /></Suspense>;
}
