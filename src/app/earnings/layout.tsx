import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Earnings",
  description: "Upcoming earnings dates, EPS/revenue estimates, and beat/miss track records for your watchlist.",
};

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
