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

// Supertrend (ATR-banded trend follower). The line sits below price in an
// uptrend and above it in a downtrend, flipping on close breaks.
export function supertrend(bars: OHLC[], period = 10, multiplier = 3): Supertrend {
  const n = bars.length;
  const value: (number | null)[] = new Array(n).fill(null);
  const direction: (Trend | null)[] = new Array(n).fill(null);
  const a = atr(bars, period);

  let finalUpper = 0;
  let finalLower = 0;
  let prevSt = 0;
  let started = false;

  for (let i = 0; i < n; i++) {
    if (a[i] == null) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    const basicUpper = mid + multiplier * a[i]!;
    const basicLower = mid - multiplier * a[i]!;
    const prevClose = bars[i - 1].close;

    const newUpper =
      !started || basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    const newLower =
      !started || basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

    let st: number;
    let trend: Trend;
    if (!started) {
      // seed: pick the side the close sits on
      trend = bars[i].close >= newLower ? 1 : -1;
      st = trend === 1 ? newLower : newUpper;
      started = true;
    } else if (prevSt === finalUpper) {
      // was in downtrend
      if (bars[i].close > newUpper) {
        trend = 1;
        st = newLower;
      } else {
        trend = -1;
        st = newUpper;
      }
    } else {
      // was in uptrend
      if (bars[i].close < newLower) {
        trend = -1;
        st = newUpper;
      } else {
        trend = 1;
        st = newLower;
      }
    }

    finalUpper = newUpper;
    finalLower = newLower;
    prevSt = st;
    value[i] = st;
    direction[i] = trend;
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
