import Studio from "@/components/studio/studio";
import { AccountStudio } from "@/components/accounts/workspaces";
import { accountEnabled, legacyWorkspaceURL } from "@/lib/accounts/config";

export const dynamic = "force-dynamic";
export default function Home() {
  return accountEnabled() ? <AccountStudio legacy={legacyWorkspaceURL()} /> : <Studio />;
}
