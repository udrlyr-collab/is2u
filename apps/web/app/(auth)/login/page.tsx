import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "들어가기" };

export default function LoginPage() {
  return <main className="login-shell">
    <section className="login-card">
      <p className="paper-label">둘만의 작은 상자</p>
      <h1>그대로 멈춰라.</h1>
      <p className="login-copy">우리 둘만 아는 네 자리로 조용히 열어보세요.</p>
      <LoginForm />
    </section>
  </main>;
}
