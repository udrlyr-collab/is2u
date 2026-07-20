import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "들어가기" };

export default function LoginPage() {
  return <main className="login-shell">
    <section className="login-card account-card">
      <p className="paper-label">OUR LITTLE ARCHIVE</p>
      <h1>그대로 멈춰라</h1>
      <p className="login-copy">아이디와 비밀번호로 우리의 추억 상자를 열어보세요</p>
      <LoginForm />
    </section>
  </main>;
}
