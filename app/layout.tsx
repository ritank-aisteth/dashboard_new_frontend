import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiSteth Clinical Operations",
  description: "Aggregate clinical operations dashboard for AiSteth",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
