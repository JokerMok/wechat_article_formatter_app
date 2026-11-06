"use client";
import Studio from "@/components/studio/studio";
import { WorkspaceGate } from "./workspace-gate";

export function AccountStudio({ legacy }: { legacy?: string }) {
  return <WorkspaceGate legacy={legacy}>{(menu) => <Studio accountMenu={menu} />}</WorkspaceGate>;
}
