export default function LoginPage() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
    <form action="/api/auth/login" method="post" style={{ display: "grid", gap: 16, width: "min(100%, 360px)" }}>
      <h1>Masuk ke dashboard</h1>
      <label>Username<input name="username" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit">Masuk</button>
    </form>
  </main>;
}
