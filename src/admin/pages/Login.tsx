import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../../lib/http";
import { useAdminAuth } from "../auth";
import { AccessDenied } from "../components/AccessDenied";
import { Button, Field, Input, LoadingState } from "../components/kit";

export function LoginPage() {
  const { status, login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "booting") return <LoadingState label="세션 확인 중…" />;
  // A stored session without admin rights must surface the access-denied
  // screen (with its logout escape hatch) here too — never a login form the
  // stored session would immediately bypass, and never a blank page.
  if (status === "denied") return <AccessDenied />;
  if (status === "signed-in") return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ad-login">
      <form className="ad-login__card" onSubmit={onSubmit}>
        <div className="ad-login__mark" aria-hidden>
          한
        </div>
        <h1 className="ad-login__title">한귤 관리자</h1>
        <p className="ad-login__sub">관리자 계정으로 로그인하세요</p>
        <Field label="이메일" required>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@talkhangyul.co.kr"
            autoFocus
          />
        </Field>
        <Field label="비밀번호" required error={error}>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          로그인
        </Button>
      </form>
    </div>
  );
}
