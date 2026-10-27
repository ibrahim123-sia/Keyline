import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";
import { site } from "@/lib/i18n";

export const metadata = { title: site.auth.forgotTitle, robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <section className="container-site py-12 md:py-20">
      <AuthCard
        title={site.auth.forgotTitle}
        subtitle={site.auth.forgotText}
        footer={
          <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-4">
            {site.auth.signInTitle}
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </section>
  );
}
