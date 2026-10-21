"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminMenu, MenuTargetOptions } from "@/features/menus/queries";
import type { MenuLocation } from "@/features/menus/schema";
import { MenuEditor } from "./menu-editor";

const footerColumns = ["footer_1", "footer_2", "footer_3"] as const satisfies MenuLocation[];

/**
 * Website -> Menus (08 §2): header, phone menu and the three footer columns. Each tab stays
 * mounted, so unsaved changes survive switching tabs.
 */
export function MenusManager({
  menus,
  options,
  tab,
  readOnly,
  extraTabs = [],
}: {
  menus: Record<MenuLocation, AdminMenu>;
  options: MenuTargetOptions;
  tab: string;
  readOnly?: boolean;
  /** More tabs after the menus (footer settings, announcement bar). */
  extraTabs?: Array<{ value: string; label: string; content: ReactNode }>;
}) {
  const panel = "data-[state=inactive]:hidden pt-2";
  return (
    <Tabs defaultValue={tab}>
      <TabsList>
        <TabsTrigger value="header">Header</TabsTrigger>
        <TabsTrigger value="mobile">Phone menu</TabsTrigger>
        <TabsTrigger value="footer">Footer columns</TabsTrigger>
        {extraTabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="header" forceMount className={panel}>
        <MenuEditor
          location="header"
          heading="Header menu"
          description="Links across the top of every page. A link with dropdown links opens a small menu on larger screens."
          initial={menus.header}
          options={options}
          readOnly={readOnly}
        />
      </TabsContent>
      <TabsContent value="mobile" forceMount className={panel}>
        <MenuEditor
          location="mobile"
          heading="Phone menu"
          description="The menu that opens from the menu button on phones. Leave it empty to show the header menu."
          initial={menus.mobile}
          options={options}
          readOnly={readOnly}
        />
      </TabsContent>
      <TabsContent value="footer" forceMount className={panel}>
        <div className="grid gap-4 xl:grid-cols-3">
          {footerColumns.map((location, i) => (
            <MenuEditor
              key={location}
              location={location}
              heading={`Column ${i + 1}`}
              description="A heading and a list of links. Empty columns are not shown."
              withTitle
              initial={menus[location]}
              options={options}
              readOnly={readOnly}
            />
          ))}
        </div>
      </TabsContent>
      {extraTabs.map((t) => (
        <TabsContent key={t.value} value={t.value} forceMount className={panel}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
