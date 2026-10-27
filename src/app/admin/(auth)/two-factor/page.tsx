import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { site } from "@/lib/i18n";

export const metadata = { title: site.auth.twoFactorTitle, robots: { index: false } };

export default function AdminTwoFactorPage() {
  return (
    <AuthCard title={site.auth.twoFactorTitle} subtitle={site.auth.twoFactorText}>
      <Suspense>
        <TwoFactorForm />
      </Suspense>
    </AuthCard>
  );
}
