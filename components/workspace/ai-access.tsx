"use client";

import * as React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function AIAccess() {
  const [state, setState] = React.useState<"checking" | "locked" | "ready">("checking");
  const [code, setCode] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/session", { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (controller.signal.aborted) return;
      setState(body.ok ? "ready" : "locked");
      setMessage(body.error?.message ?? "");
    }).catch(() => { if (!controller.signal.aborted) { setState("locked"); setMessage("访问验证暂时不可用，请重试。"); } });
    return () => controller.abort();
  }, []);
  if (state === "ready") return <p className="mt-2 text-xs text-muted-foreground">服务端访问已验证</p>;
  if (state === "checking") return <p role="status" className="mt-2 text-xs">正在验证服务端访问…</p>;
  return <form className="mt-2 space-y-2" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/ai/session", { method: "POST", headers: { "x-ai-access-code": code } });
      const body = await response.json();
      if (body.ok) { setState("ready"); setCode(""); }
      else setMessage(body.error?.message ?? "验证失败，请重试。");
    } catch { setMessage("网络连接失败，请重试。"); }
    finally { setBusy(false); }
  }}>
    <Input type="password" aria-label="服务端 AI 访问口令" autoComplete="current-password" placeholder="服务端 AI 访问口令" value={code} onChange={(event) => setCode(event.target.value)} />
    <Button type="submit" size="sm" disabled={busy || !code}>{busy ? "验证中…" : "验证访问"}</Button>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </form>;
}
