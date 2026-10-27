import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/guards";
import { site } from "@/lib/i18n";
import { AccountMenuClient } from "./account-menu-client";

/** Header account area: "Sign in" for guests, avatar menu for signed-in users (06 §2). */
export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="inline-flex rounded-button px-3 py-2 text-[15px] font-semibold text-ink hover:bg-surface-muted"
      >
        {site.header.signIn}
      </Link>
    );
  }
  return <AccountMenuClient name={user.name} email={user.email} isAdmin={user.role === "admin"} />;
}
