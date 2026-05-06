import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weeek Permissions Gateway",
  description: "Issue scoped Weeek API keys",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
