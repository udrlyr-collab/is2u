import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "가입하기" };

export default function SignupPage() {
  return <main className="login-shell"><section className="login-card account-card signup-card"><p className="paper-label">NEW ARCHIVE KEEPER</p><h1>내 상자 만들기</h1><p className="login-copy">내 이름으로 작은 추억 상자를 먼저 만들어보세요</p><SignupForm /></section></main>;
}
