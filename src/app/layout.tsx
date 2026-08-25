import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Baan Sabai Spa — AI Receptionist Demo",
  description: "ระบบรับลูกค้าและจองคิวสปาผ่าน LINE แบบอัตโนมัติ",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
