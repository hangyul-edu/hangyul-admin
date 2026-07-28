import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../../lib/http";
import { useAdminAuth } from "../auth";
import { Button, Field, Input, LoadingState } from "../components/kit";

export function LoginPage() {
  const { status, login, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clearingRef = useRef(false);

  // The login route ALWAYS ends at the email/password form. A stored
  // session that authenticates but lacks the admin role is incompatible
  // here — discard it (server-side revocation + storage wipe) instead of
  // showing an interstitial that hides the form.
  useEffect(() => {
    if (status !== "denied" || clearingRef.current) return;
    clearingRef.current = true;
    void logout().then(() => {
      setNotice(
        "관리자 권한이 없는 기존 세션을 정리했어요. 관리자 계정으로 로그인해 주세요.",
      );
    });
  }, [status, logout]);

  if (status === "booting" || status === "denied")
    return <LoadingState label="세션 확인 중…" />;
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
        {notice && (
          <p className="ad-login__notice" role="status">
            {notice}
          </p>
        )}
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
