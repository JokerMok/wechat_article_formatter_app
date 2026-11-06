"use client";
import Link from "next/link";
import Studio from "@/components/studio/studio";
import UnifiedWorkspace from "@/components/workspace/unified-workspace";
import { WorkspaceGate } from "./workspace-gate";

export function AccountStudio({ legacy }: { legacy?: string }) {
  return <WorkspaceGate legacy={legacy}>{(menu) => <Studio accountMenu={menu} />}</WorkspaceGate>;
}
export function AccountMultiplatform({ legacy }: { legacy?: string }) {
  return <WorkspaceGate legacy={legacy}>{(menu) =>
    <>
      <div className="formatter-multi-account"><Link href="/" prefetch={false}>风格排版</Link>{menu}</div>
      <UnifiedWorkspace accountMode />
    </>
  }</WorkspaceGate>;
}
