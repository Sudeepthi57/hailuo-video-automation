import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Automation",
  description: "AI Video Production Pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
