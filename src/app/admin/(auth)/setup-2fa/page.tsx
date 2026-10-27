import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SetupTwoFactor } from "@/components/auth/setup-two-factor";
import { requireAdminPage } from "@/lib/auth/guards";
import { admin } from "@/lib/i18n";

export const metadata = { title: admin.twoFactorSetup.title, robots: { index: false } };
export const instant = false;

export default async function SetupTwoFactorPage() {
  const ctx = await requireAdminPage({ allowWithoutTwoFactor: true });
  if (ctx.user.twoFactorEnabled) redirect("/admin");
  return (
    <AuthCard title={admin.twoFactorSetup.title} subtitle={admin.twoFactorSetup.intro}>
      <SetupTwoFactor />
    </AuthCard>
  );
}
