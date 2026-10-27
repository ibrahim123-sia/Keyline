import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignInNotice } from "@/components/auth/sign-in-notice";
import { site } from "@/lib/i18n";

export const metadata = { title: site.auth.adminSignInTitle, robots: { index: false } };

export default function AdminSignInPage() {
  return (
    <AuthCard title={site.auth.adminSignInTitle} subtitle={site.auth.adminSignInSubtitle}>
      <Suspense>
        <SignInNotice />
        <SignInForm variant="admin" />
      </Suspense>
    </AuthCard>
  );
}
