import UnifiedWorkspace from "@/components/workspace/unified-workspace";
import { AccountMultiplatform } from "@/components/accounts/workspaces";
import { accountEnabled, legacyWorkspaceURL } from "@/lib/accounts/config";

export const dynamic = "force-dynamic";
export default function Multiplatform() {
  return accountEnabled() ? <AccountMultiplatform legacy={legacyWorkspaceURL()} /> : <UnifiedWorkspace />;
}
