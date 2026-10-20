import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lintel",
  description: "Website, CRM and lead engine for real estate agencies",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
