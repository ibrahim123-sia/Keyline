import { and, eq } from "drizzle-orm";
import { PasswordForm, ProfileForm } from "@/components/account/profile-forms";
import { getDb } from "@/db/client";
import { accounts, users } from "@/db/schema/auth";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account } from "@/lib/i18n";

export const metadata = { title: account.nav.profile };
export const instant = false;

const t = account.profilePage;

/** Profile (12 §2): details, password, connected Google account. */
export default async function ProfilePage() {
  const user = await requireCustomerPage();
  const db = await getDb();
  const [row] = await db
    .select({ phone: users.phone, preferredContact: users.preferredContact })
    .from(users)
    .where(eq(users.id, user.id));
  const methods = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id)));
  const hasPassword = methods.some((m) => m.providerId === "credential");
  const google = methods.some((m) => m.providerId === "google");
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-h1">{t.title}</h1>
        <ProfileForm
          initial={{
            name: user.name,
            email: user.email,
            phone: row?.phone ?? "",
            preferredContact: row?.preferredContact ?? null,
          }}
        />
      </section>
      {hasPassword && (
        <section aria-labelledby="password" className="flex flex-col gap-4">
          <h2 id="password" className="text-h3">
            {t.password}
          </h2>
          <PasswordForm />
        </section>
      )}
      {google && (
        <section aria-labelledby="google" className="flex flex-col gap-2">
          <h2 id="google" className="text-h3">
            {t.google}
          </h2>
          <p className="text-text-muted">{t.googleConnected}</p>
        </section>
      )}
    </div>
  );
}
