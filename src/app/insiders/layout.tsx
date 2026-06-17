import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insider Buys",
  description: "Open-market purchases by company insiders (CEOs, CFOs, directors) from SEC Form 4 filings.",
};

export default function InsidersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
