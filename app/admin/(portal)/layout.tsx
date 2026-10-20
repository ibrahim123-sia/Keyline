import { AdminShell } from "@/components/admin/admin-shell";

export const instant = false;

export default function AdminPortalLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell theme="light">{children}</AdminShell>;
}
