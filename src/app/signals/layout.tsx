import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signals",
  description:
    "Your watchlist at a glance — trend (Supertrend), momentum (MACD), and whether company insiders or famous funds are buying each ticker.",
};

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
