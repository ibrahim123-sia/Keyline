import { AccountNav } from "@/components/account/account-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteToaster } from "@/components/site/site-toaster";
import { requireCustomerPage } from "@/lib/auth/guards";

export const instant = false;

/** Customer area (12): public site theme, left menu on desktop, tabs on phone. */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireCustomerPage();
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-site grid gap-8 py-10 md:grid-cols-[220px_1fr] md:py-14">
        <aside>
          <AccountNav
            enabled={[
              "overview",
              "saved",
              "searches",
              "tours",
              "inquiries",
              "chats",
              "compare",
              "profile",
              "notifications",
              "privacy",
            ]}
          />
        </aside>
        <div className="min-w-0">{children}</div>
      </main>
      <SiteFooter />
      <SiteToaster />
    </>
  );
}
