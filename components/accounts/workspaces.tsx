"use client";
import Studio from "@/components/studio/studio";
import { WorkspaceGate } from "./workspace-gate";

export function AccountStudio() {
  return <WorkspaceGate>{(menu) => <Studio accountMenu={menu} />}</WorkspaceGate>;
}
