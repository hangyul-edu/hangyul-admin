import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { clearAdminSession } from "../lib/storage";

interface State {
  error: Error | null;
}

/**
 * Last line of defense: a rendering crash must never leave the admin app
 * as a blank page. Shows the error and a reset action that wipes the
 * stored session (a corrupt session being the most likely culprit) and
 * reloads the login screen.
 */
export class AdminErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[admin] render crash:", error, info.componentStack);
  }

  private reset = () => {
    try {
      clearAdminSession();
      sessionStorage.clear();
    } catch {
      /* storage unavailable */
    }
    window.location.href = "/admin/login";
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="hgadm-login">
        <div className="hgadm-login__card" role="alert">
          <div className="hgadm-login__mark" aria-hidden>
            ⚠️
          </div>
          <h1 className="hgadm-login__title">화면을 표시하지 못했어요</h1>
          <p className="hgadm-login__sub">
            예상치 못한 오류가 발생했습니다. 세션을 초기화하고 로그인 화면으로
            이동해 주세요.
          </p>
          <pre className="hgadm-json" style={{ marginBottom: 16 }}>
            {this.state.error.message}
          </pre>
          <button className="hgadm-btn hgadm-btn--primary hgadm-btn--lg hgadm-btn--block" onClick={this.reset}>
            세션 초기화 후 로그인 화면으로
          </button>
        </div>
      </div>
    );
  }
}
