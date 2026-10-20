import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignInNotice } from "@/components/auth/sign-in-notice";
import { site } from "@/lib/i18n";

export const metadata = { title: site.auth.signInTitle, robots: { index: false } };

export default function SignInPage() {
  return (
    <section className="container-site py-12 md:py-20">
      <AuthCard
        title={site.auth.signInTitle}
        subtitle={site.auth.signInSubtitle}
        footer={
          <>
            {site.auth.noAccount}{" "}
            <Link href="/sign-up" className="font-semibold text-ink underline underline-offset-4">
              {site.auth.createAccount}
            </Link>
          </>
        }
      >
        <Suspense>
          <SignInNotice />
          <SignInForm variant="customer" />
        </Suspense>
      </AuthCard>
    </section>
  );
}
