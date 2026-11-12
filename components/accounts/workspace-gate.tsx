"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, LayoutTemplate, UserRound } from "lucide-react";
import type { z } from "zod";
import type { AccountTab, entitlementsSchema } from "@/lib/accounts/center";
import { accountFetch, bindWorkspace } from "@/lib/accounts/browser";

type Rights = Omit<z.infer<typeof entitlementsSchema>, "product">;
type SignedIn = {
  state: "signed-in"; name: string; scope: string; binding: string; rights?: Rights; rightsError?: string;
};
type AccountState = SignedIn | { state: "signed-out" | "error"; error?: string };
const marker = "formatter-account-session-change";
const loginMessages: Record<string, string> = {
  "login-failed": "登录未完成，请重试。",
  "invalid-credentials": "账号或密码不正确，请重试。",
  "login-expired": "登录请求已过期、已使用或被另一个标签页替换，请重新登录。",
  "mapping-conflict": "账号关联未完成，已有作品归属未变更。",
  cancelled: "已取消登录。",
};
const entryLabels = [
  ["redeem", "兑换权益"], ["security", "账号与安全"], ["records", "权益记录"],
] as const;

function notifyTabs() {
  try { localStorage.setItem(marker, crypto.randomUUID()); } catch {}
}

export function WorkspaceGate({ children }: {
  children: (menu: ReactNode) => ReactNode;
}) {
  const [state, setState] = useState<AccountState>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const active = state?.state === "signed-in";
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    const request = (async () => {
      try {
        const response = await accountFetch("/api/account/status", { signal: AbortSignal.timeout(17_000) });
        const { workspaceKey, ...payload } = await response.json() as AccountState & { code?: string; workspaceKey?: string };
        if (response.status === 409 && payload.code === "ACCOUNT_CHANGED") {
          window.location.reload();
          return;
        }
        if (!response.ok) {
          if (!loaded.current) setState({ state: "error", error: payload.state === "signed-in" ? undefined : payload.error });
          else setNotice("账号状态暂不可用，请重试。");
          return;
        }
        if (payload.state === "signed-in" && !(workspaceKey && await bindWorkspace(payload.scope, payload.binding, workspaceKey))) {
          window.location.reload();
          return;
        }
        if (loaded.current && payload.state === "signed-out") {
          window.location.replace("/");
          return;
        }
        if (!loaded.current && payload.state === "signed-in") {
          try {
            const previous = localStorage.getItem(marker);
            if (previous !== payload.scope) localStorage.setItem(marker, payload.scope);
          } catch {}
        }
        loaded.current = payload.state === "signed-in";
        setState(payload);
        if (root.current) root.current.style.visibility = "";
      } catch {
        if (!loaded.current) setState({ state: "error", error: "账号服务暂不可用，请重试。" });
        else setNotice("账号状态暂不可用，请重试。");
      }
    })();
    pending.current = request;
    void request.finally(() => { if (pending.current === request) pending.current = undefined; });
    return request;
  }, []);
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const message = search.get("account");
    if (message && Object.hasOwn(loginMessages, message)) {
      queueMicrotask(() => setNotice(loginMessages[message]));
      history.replaceState(history.state, "", window.location.pathname);
    }
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const stored = (event: StorageEvent) => { if (event.key === marker) void refresh(); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    const hide = (event: PageTransitionEvent) => {
      if (event.persisted && root.current) root.current.style.visibility = "hidden";
    };
    const timer = window.setInterval(visible, 45_000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    window.addEventListener("storage", stored);
    window.addEventListener("pageshow", show);
    window.addEventListener("formatter-entitlements-changed", visible);
    window.addEventListener("pagehide", hide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      window.removeEventListener("storage", stored);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("formatter-entitlements-changed", visible);
      window.removeEventListener("pagehide", hide);
    };
  }, [refresh]);

  async function action(operation: "entry" | "logout" | "logout-all", tab?: AccountTab) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await accountFetch(`/api/account/${operation}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tab ? { tab } : {}),
        signal: AbortSignal.timeout(16_000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "ACCOUNT_CHANGED") window.location.reload();
        else if (response.status === 401) void refresh();
        throw new Error(data.error || "操作未完成，请重试。");
      }
      if (operation === "entry") window.location.assign(data.url);
      else {
        if (root.current) root.current.style.visibility = "hidden";
        setState({ state: "signed-out" });
        notifyTabs();
        window.location.replace("/");
      }
    } catch (error) {
      setNotice(error instanceof Error && error.name === "Error" ? error.message : "操作结果暂未确认，请刷新后重试。");
    } finally {
      setBusy(false);
      setLogoutConfirm(false);
    }
  }

  if (!active) return (
    <main className="formatter-signin">
      <div className="formatter-signin-layout">
        <section aria-labelledby="formatter-signin-title">
          <span className="formatter-brand-mark"><LayoutTemplate size={24} aria-hidden="true" /></span>
          <h1 id="formatter-signin-title">登录风格排版</h1>
          <div className="formatter-signin-actions">
            {!state ? <p role="status">正在检查登录状态…</p> : (
              <>
                {(notice || state.error) && <p role="status">{notice || state.error}</p>}
                {state.state === "error" ? (
                  <button className="formatter-signin-primary" type="button" onClick={() => { setState(undefined); void refresh(); }}>重试</button>
                ) : (
                  <>
                    <form method="post" action="/api/account/login" className="formatter-password-form">
                      <label>
                        <span>账号</span>
                        <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={160} required />
                      </label>
                      <label>
                        <span>密码</span>
                        <input name="password" type="password" autoComplete="current-password" maxLength={256} required />
                      </label>
                      <button className="formatter-signin-primary" type="submit">登录 <ArrowRight size={18} aria-hidden="true" /></button>
                    </form>
                    <div className="formatter-signin-links">
                      <form method="post" action="/api/account/register">
                        <button type="submit">注册账号</button>
                      </form>
                      <form method="get" action="/api/account/reset">
                        <button type="submit">找回密码</button>
                      </form>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
        <div className="formatter-signin-preview" aria-hidden="true">
          <div className="formatter-preview-window">
            <div className="formatter-preview-bar"><i /><i /><i /><span /></div>
            <div className="formatter-preview-layout">
              <div className="formatter-preview-tools"><i /><i /><i /><i /></div>
              <div className="formatter-preview-article">
                <div className="formatter-preview-cover" />
                <strong>把思路写清楚</strong>
                <div className="formatter-preview-lines"><i /><i /><i /></div>
                <div className="formatter-preview-quote">先说结论，再展开细节。</div>
                <div className="formatter-preview-lines"><i /><i /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );

  const menu = (
    <details className="formatter-account-menu">
      <summary aria-label="账号菜单"><UserRound size={16} aria-hidden="true" /><span>{state.name}</span><ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="formatter-account-popover">
        <strong>{state.name}</strong>
        {state.rights ? (
          <>
            <p>{state.rights.membership.active ? "本产品会员" : state.rights.membership.expires_at ? "会员已到期" : "未开通会员"}
              {state.rights.membership.expires_at && <time dateTime={state.rights.membership.expires_at}> · {new Date(state.rights.membership.expires_at).toLocaleDateString("zh-CN")}</time>}
            </p>
            <ul aria-label="本产品额度">{state.rights.features.filter((feature) => feature.kind === "quota").map((feature) =>
              <li key={feature.id}><span>{feature.name}</span><span>{feature.remaining} 次{feature.held ? ` · 预占 ${feature.held}` : ""}</span></li>,
            )}</ul>
          </>
        ) : <p role="status">{state.rightsError ?? "正在查询权益…"} <button onClick={() => void refresh()} type="button">重试</button></p>}
        <div className="formatter-account-actions">
          {entryLabels.map(([tab, label]) => <button type="button" key={tab} disabled={busy} onClick={() => void action("entry", tab)}>{label}</button>)}
          <form method="post" action="/api/account/switch">
            <input type="hidden" name="binding" value={state.binding} />
            <button type="submit" disabled={busy}>切换账号</button>
          </form>
          <button type="button" disabled={busy} onClick={() => void action("logout")}>退出当前产品</button>
          {logoutConfirm ?
            <div className="formatter-logout-confirm"><button type="button" disabled={busy} onClick={() => void action("logout-all")}>确认退出全部</button><button type="button" onClick={() => setLogoutConfirm(false)}>取消</button></div> :
            <button type="button" disabled={busy} onClick={() => setLogoutConfirm(true)}>退出全部产品</button>}
        </div>
      </div>
    </details>
  );
  return <div ref={root}>{notice && <div className="formatter-account-feedback" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="关闭账号提示">×</button></div>}{children(menu)}</div>;
}
