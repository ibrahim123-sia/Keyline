import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { site } from "@/lib/i18n";

export const metadata = { title: site.auth.signUpTitle, robots: { index: false } };

export default function SignUpPage() {
  return (
    <section className="container-site py-12 md:py-20">
      <AuthCard
        title={site.auth.signUpTitle}
        subtitle={site.auth.signUpSubtitle}
        footer={
          <>
            {site.auth.haveAccount}{" "}
            <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-4">
              {site.auth.signInTitle}
            </Link>
          </>
        }
      >
        <Suspense>
          <SignUpForm />
        </Suspense>
      </AuthCard>
    </section>
  );
}
