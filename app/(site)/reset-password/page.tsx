import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";
import { site } from "@/lib/i18n";

export const metadata = { title: site.auth.resetTitle, robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <section className="container-site py-12 md:py-20">
      <AuthCard title={site.auth.resetTitle}>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </AuthCard>
    </section>
  );
}
