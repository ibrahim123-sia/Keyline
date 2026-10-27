import type { ReactNode } from "react";
import { SettingsNav } from "@/components/admin/settings/settings-nav";

/** Admin -> Settings (04): tabs on the side (a scrolling row on small screens). */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <SettingsNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
