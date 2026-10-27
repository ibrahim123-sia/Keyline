import Link from "next/link";
import { admin } from "@/lib/i18n";

/** notFound() inside the admin portal: keeps the admin layout (the site's 404 is public). */
export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">
        {admin.errors.notFoundTitle}
      </h1>
      <p className="text-[14px] text-text-muted">{admin.errors.notFoundText}</p>
      <Link
        href="/admin"
        className="text-[14px] font-semibold text-ink underline underline-offset-4"
      >
        {admin.errors.backToDashboard}
      </Link>
    </div>
  );
}
