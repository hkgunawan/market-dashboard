# Market Dashboard

Personal watchlist dashboard for the markets I follow — gold, Bitcoin, the Nasdaq 100, and any stock or crypto ticker I add. Built with Next.js 16, React 19, TypeScript and Tailwind CSS.

## Features

- **Watchlist** — gold (PAXG), BTC-USD and the Nasdaq 100 (QQQ) by default; add/remove any symbol, persisted in localStorage
- **Live quotes** — price, day change, auto-refresh every 60s
- **Candlestick charts** — [lightweight-charts](https://github.com/tradingview/lightweight-charts) (TradingView's open-source library) with 1D/1W/1M/6M/1Y/5Y ranges
- **Indicators** — SMA 50/200 overlays and RSI(14), computed server-side
- **AI daily brief** *(optional)* — a neutral 3–4 sentence summary of the watchlist via the Anthropic API; activates only when `ANTHROPIC_API_KEY` is set
- **Multi-provider data layer** — crypto via the Binance public API (no key); stocks, ETFs and metals via Twelve Data (free key) with Yahoo Finance as fallback; everything behind a TTL cache with stale-on-error fallback and 429 backoff

## Architecture

```
Browser ──> /api/quotes ──┐
        ──> /api/history ─┼─> lib/market.ts (provider facade + TTL cache)
        ──> /api/brief  ──┘        ├─> lib/binance.ts     (crypto: X-USD → XUSDT, incl. PAXG gold)
                                   ├─> lib/twelvedata.ts  (stocks/ETFs/XAU-USD, key-gated)
                                   └─> lib/yahoo.ts       (fallback)
```

Data calls never leave the server — the browser only talks to the app's own API routes, which cache aggressively so UI polling can't burst the upstream rate limits.

## Run it

```bash
npm install
npm run dev
```

Works with zero configuration (crypto + PAXG gold via Binance). Optional keys in `.env.local`:

```
TWELVEDATA_API_KEY=...   # free at twelvedata.com — enables stocks, ETFs (QQQ) and spot gold XAU/USD
ANTHROPIC_API_KEY=...    # enables the AI daily brief
```

## Disclaimers

Unofficial data sources, personal use only, **not financial advice** — this is a viewing tool, it does not predict anything.
