// Pure indicator math over price series. Returns arrays aligned with input
// (positions before the period warm-up are null).

export interface OHLC {
  high: number;
  low: number;
  close: number;
}

// Average True Range (Wilder smoothing). null until `period` bars are in.
export function atr(bars: OHLC[], period = 10): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr: number[] = new Array(bars.length).fill(0);
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose)
    );
  }
  let a = 0;
  for (let i = 1; i <= period; i++) a += tr[i];
  a /= period;
  out[period] = a;
  for (let i = period + 1; i < bars.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

export type Trend = 1 | -1; // 1 = uptrend (line below price), -1 = downtrend

export interface Supertrend {
  value: (number | null)[]; // the supertrend line
  direction: (Trend | null)[]; // trend at each bar
}

// Supertrend — a faithful port of Kıvanç Özbilgiç's popular TradingView Pine
// script (the widely-used "Supertrend" by KivancOzbilgic). hl2 ± multiplier·ATR,
// with the support/resistance bands ratcheting on close[1] and the trend flip
// tested against the *previous* bands:
//
//   up = hl2 − mult·atr ;  up := close[1] > up1 ? max(up, up1) : up
//   dn = hl2 + mult·atr ;  dn := close[1] < dn1 ? min(dn, dn1) : dn
//   trend := trend==-1 and close > dn1 ? 1 : trend==1 and close < up1 ? -1 : trend
//   line  = trend==1 ? up : dn
//
// ATR uses Wilder smoothing (Pine's default atr(), changeATR=true). The line sits
// below price in an uptrend (trend 1) and above it in a downtrend (trend -1).
export function supertrend(bars: OHLC[], period = 10, multiplier = 3): Supertrend {
  const n = bars.length;
  const value: (number | null)[] = new Array(n).fill(null);
  const direction: (Trend | null)[] = new Array(n).fill(null);
  const a = atr(bars, period);

  let upPrev: number | null = null;
  let dnPrev: number | null = null;
  let trend: Trend = 1;

  for (let i = 0; i < n; i++) {
    if (a[i] == null) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    let up = hl2 - multiplier * a[i]!;
    let dn = hl2 + multiplier * a[i]!;

    // nz(up[1], up) / nz(dn[1], dn) — fall back to the current band on the first bar
    const up1 = upPrev ?? up;
    const dn1 = dnPrev ?? dn;

    // ratchet the bands using the previous close
    const prevClose = bars[i - 1].close;
    if (prevClose > up1) up = Math.max(up, up1);
    if (prevClose < dn1) dn = Math.min(dn, dn1);

    // flip the trend against the previous bands (Kıvanç's exact condition)
    if (trend === -1 && bars[i].close > dn1) trend = 1;
    else if (trend === 1 && bars[i].close < up1) trend = -1;

    value[i] = trend === 1 ? up : dn;
    direction[i] = trend;
    upPrev = up;
    dnPrev = dn;
  }

  return { value, direction };
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Wilder's RSI
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
