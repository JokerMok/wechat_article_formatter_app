import Studio from "@/components/studio/studio";
import { AccountStudio } from "@/components/accounts/workspaces";
import { readServerAIConfig } from "@/lib/ai/server/config";
import { accountEnabled } from "@/lib/accounts/config";

export const dynamic = "force-dynamic";
export default function Home() {
  if (accountEnabled()) return <AccountStudio />;
  let cloudConfigured = false;
  try {
    readServerAIConfig();
    cloudConfigured = true;
  } catch {
    // The workspace can still apply rules and capture HTML without a model.
  }
  return <Studio connectionStatus={{
    cloudConfigured,
    layoutOff: process.env.AI_LAYOUT_PROVIDER?.trim() === "off",
  }} />;
}
