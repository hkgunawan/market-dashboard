import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Money",
  description: "What famous funds accumulated last quarter, diffed from their SEC 13F filings.",
};

export default function SmartMoneyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
