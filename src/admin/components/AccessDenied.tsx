import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { MEMBER_APP_URL } from "../../lib/config";
import { http } from "../../lib/http";
import { useAdminAuth } from "../auth";
import { personNameWithEmail } from "../lib/adminIdentity";
import { Button } from "./kit";

interface MemberProfile {
  email: string;
  name: string | null;
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
    <div className="hgadm-login">
      <div className="hgadm-login__card" role="alert">
        <div className="hgadm-login__mark" aria-hidden>
          <ShieldAlert size={30} strokeWidth={1.75} />
        </div>
        <h1 className="hgadm-login__title">관리자 권한이 없습니다</h1>
        <p className="hgadm-login__sub">
          {who.data
            ? `현재 ${personNameWithEmail(who.data)} 계정으로 로그인되어 있지만, 이 계정에는 관리자 권한이 없습니다.`
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
        <p className="hgadm-text-center hgadm-mt-12 hgadm-mb-0">
          {/* The login route also clears incompatible sessions on arrival,
              so this path works even if the logout call cannot reach the
              server. Full-page navigation keeps it dependency-free. */}
          <a className="hgadm-text-sm hgadm-access-link" href="/login">
            관리자 로그인 화면으로
          </a>
          {/* The member app is another domain; linked only when configured. */}
          {MEMBER_APP_URL && (
            <a className="hgadm-text-sm" href={MEMBER_APP_URL}>
              멤버 앱으로 돌아가기
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
