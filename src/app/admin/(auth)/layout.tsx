import { admin } from "@/lib/i18n";

/** Admin sign-in screens: neutral admin theme, no portal chrome. */
export default function AdminAuthLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div
      data-theme-scope
      className="theme-admin flex min-h-screen flex-col items-center bg-background px-4 py-16"
    >
      <p className="mb-8 text-[15px] font-bold tracking-tight text-ink">{admin.brand}</p>
      <main id="main" className="w-full">
        {children}
      </main>
    </div>
  );
}
