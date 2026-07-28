import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { http } from "../../lib/http";
import { useAdminAuth } from "../auth";
import { Button } from "./kit";

interface MemberProfile {
  email: string;
  nickname: string | null;
}

/**
 * Shown when a valid session belongs to an account WITHOUT the admin role.
 * The one hard requirement here: the user must never be stuck — logout is
 * always available, fully clears the session (server-side revocation +
 * client storage), and drops them on the admin login screen.
 */
export function AccessDenied() {
  const { logout } = useAdminAuth();
  const [signingOut, setSigningOut] = useState(false);

  // Identify the signed-in account so the user understands *which* login is
  // blocking them. /users/me works for any authenticated member.
  const who = useQuery({
    queryKey: ["admin", "denied-me"],
    queryFn: () => http.get<MemberProfile>("/users/me"),
    retry: false,
  });

  async function onLogout() {
    setSigningOut(true);
    try {
      await logout();
      // The auth status flips to signed-out and the route guards render the
      // login screen; nothing else to do here.
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="ad-login">
      <div className="ad-login__card" role="alert">
        <div className="ad-login__mark" aria-hidden>
          🔒
        </div>
        <h1 className="ad-login__title">관리자 권한이 없습니다</h1>
        <p className="ad-login__sub">
          {who.data
            ? `현재 ${who.data.email} 계정으로 로그인되어 있지만, 이 계정에는 관리자 권한이 없습니다.`
            : "현재 로그인된 계정에는 관리자 권한이 없습니다."}
          <br />
          로그아웃 후 관리자 계정으로 다시 로그인해 주세요.
        </p>
        <Button
          variant="primary"
          size="lg"
          block
          loading={signingOut}
          onClick={() => void onLogout()}
        >
          로그아웃하고 관리자 로그인으로 이동
        </Button>
        <p style={{ textAlign: "center", marginTop: 14, marginBottom: 0 }}>
          {/* The login route also clears incompatible sessions on arrival,
              so this path works even if the logout call cannot reach the
              server. Full-page navigation keeps it dependency-free. */}
          <a href="/admin/login" style={{ fontSize: 13, marginRight: 14 }}>
            관리자 로그인 화면으로
          </a>
          <a href="/" style={{ fontSize: 13 }}>
            멤버 앱으로 돌아가기
          </a>
        </p>
      </div>
    </div>
  );
}
