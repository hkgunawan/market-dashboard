import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flips",
  description:
    "Which big-cap stocks, gold (GLD), silver (SLV) and crypto recently changed Supertrend direction — on the daily and the weekly timeframe.",
};

export default function FlipsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
