// Pure indicator math over price series. Returns arrays aligned with input
// (positions before the period warm-up are null).

export interface OHLC {
  high: number;
  low: number;
  close: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Heikin Ashi: smoothed candles that filter noise and make trends easier to read.
//   haClose = (O+H+L+C)/4
//   haOpen  = (prev haOpen + prev haClose)/2   (seeded with (O+C)/2)
//   haHigh/haLow include the HA open/close
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    out.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
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

// EMA seeded from the first value, matching TradingView's ta.ema (values from bar 0).
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length);
  const alpha = 2 / (period + 1);
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
}

// Chris Moody's "Ultimate MACD" (CM_Ult_MacD): EMA(fast) − EMA(slow) for the
// MACD line, but an *SMA* of the MACD for the signal line (his distinguishing
// choice), and histogram = macd − signal. (The MTF resampling of the original
// is intentionally omitted — this runs on the chart's own timeframe.)
export function macdCM(values: number[], fast = 12, slow = 26, signalLen = 9): MacdResult {
  const n = values.length;
  if (n === 0) return { macd: [], signal: [], hist: [] };
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const macd = ef.map((v, i) => v - es[i]);
  const sig = sma(macd, signalLen);
  const hist = macd.map((m, i) => (sig[i] == null ? null : m - sig[i]!));
  return { macd, signal: sig, hist };
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
