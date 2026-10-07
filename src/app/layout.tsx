import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Landing",
  description: "Interactive Spline 3D scene",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
