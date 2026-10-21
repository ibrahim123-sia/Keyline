"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminMenu, MenuTargetOptions } from "@/features/menus/queries";
import type { MenuLocation } from "@/features/menus/schema";
import { MenuEditor } from "./menu-editor";

const footerColumns = ["footer_1", "footer_2", "footer_3"] as const satisfies MenuLocation[];

/**
 * Website -> Menus (08 §2): header, phone menu, the footer (three columns and its text) and
 * the announcement bar. Every tab stays mounted, so unsaved changes survive switching tabs.
 */
export function MenusManager({
  menus,
  options,
  tab,
  readOnly,
  footerSettings,
  announcement,
}: {
  menus: Record<MenuLocation, AdminMenu>;
  options: MenuTargetOptions;
  tab: string;
  readOnly?: boolean;
  /** Footer text form, under the columns. */
  footerSettings: ReactNode;
  announcement: ReactNode;
}) {
  const panel = "flex flex-col gap-4 pt-2 data-[state=inactive]:hidden";
  return (
    <Tabs defaultValue={tab}>
      <TabsList>
        <TabsTrigger value="header">Header</TabsTrigger>
        <TabsTrigger value="mobile">Phone menu</TabsTrigger>
        <TabsTrigger value="footer">Footer</TabsTrigger>
        <TabsTrigger value="announcement">Announcement bar</TabsTrigger>
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
              heading={`Footer column ${i + 1}`}
              description="A heading and a list of links. Empty columns are not shown."
              withTitle
              initial={menus[location]}
              options={options}
              readOnly={readOnly}
            />
          ))}
        </div>
        {footerSettings}
      </TabsContent>
      <TabsContent value="announcement" forceMount className={panel}>
        {announcement}
      </TabsContent>
    </Tabs>
  );
}
