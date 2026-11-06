let current: { scope: string; binding: string; key: CryptoKey } | undefined;

// A browser document never changes storage owners. A login/switch always navigates a new document.
export async function bindWorkspace(scope: string, binding: string, workspaceKey: string) {
  if (current && (current.scope !== scope || current.binding !== binding)) return false;
  if (!current) {
    const raw = Uint8Array.from(atob(workspaceKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    if (raw.byteLength !== 32) return false;
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    current = { scope, binding, key };
  }
  return true;
}
export const workspaceEncryptionKey = () => current?.key;
export const isAccountWorkspace = () => !!current;
export const scopedStorageName = (name: string) => current ? `${name}:account-v1:${current.scope}` : name;

export function accountFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (current) headers.set("X-Formatter-Session", current.binding);
  return fetch(input, { ...init, headers, cache: "no-store" });
}
