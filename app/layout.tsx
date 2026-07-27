import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const title = "HeatGuard — Cooler routes for everyday life";
const description =
  "Plan cooler everyday trips with hyperlocal heat-aware routes, safer departure times, and personal protection guidance.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const imageUrl = host ? `${protocol}://${host}/og.png` : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: imageUrl ? [{ url: imageUrl, width: 1731, height: 909 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
