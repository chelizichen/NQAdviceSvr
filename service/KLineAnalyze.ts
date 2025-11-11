import { futuresPathForDate } from "../lib/paths";
import fs from 'fs'
// ===== Futures parsing & K-line analysis (pure functions) =====
type FuturesTick = {
  time?: string; // HH:MM:SS
  price?: number; // 现价
  high?: number; // 最高价
  low?: number; // 最低价
  openToday?: number; // 今日开盘价
  prevClose?: number; // 昨日收盘价
};

function toFiniteNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseFuturesLine(line: string): FuturesTick | null {
  if (!line || typeof line !== "string") return null;
  const parts = line.split("|");
  const tick: FuturesTick = {};
  for (const p of parts) {
    const idx = p.indexOf(":");
    if (idx === -1) continue;
    const key = p.slice(0, idx).trim();
    const val = p.slice(idx + 1).trim();
    switch (key) {
      case "当前时间":
        tick.time = val;
        break;
      case "现价":
        tick.price = toFiniteNumber(val);
        break;
      case "最高价":
        tick.high = toFiniteNumber(val);
        break;
      case "最低价":
        tick.low = toFiniteNumber(val);
        break;
      case "今日开盘价":
        tick.openToday = toFiniteNumber(val);
        break;
      case "昨日收盘价":
        tick.prevClose = toFiniteNumber(val);
        break;
      default:
        // ignore other fields
        break;
    }
  }
  return tick;
}

function parseFuturesText(text: string): FuturesTick[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ticks = lines.map(parseFuturesLine).filter((t): t is FuturesTick => !!t);
  return ticks;
}

// Localized now string for prompt contexts
function nowLocal(): string {
  try { return new Date().toLocaleString('zh-CN', { hour12: false }); } catch { return new Date().toLocaleString(); }
}

type KlineAnalysis = {
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  body: number;
  upper: number;
  lower: number;
  shape: string;
  trend: string;
  slope: number;
  maShort?: number;
  maLong?: number;
  maSignal: string;
  rsi: number;
};

function analyzeKline(ticks: FuturesTick[]): KlineAnalysis | null {
  if (!Array.isArray(ticks) || ticks.length === 0) return null;
  const closes = ticks
    .map((t) => t.price)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const highs = ticks
    .map((t) => t.high)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const lows = ticks
    .map((t) => t.low)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (closes.length === 0 || highs.length === 0 || lows.length === 0) return null;

  const openTodayNum = ticks[0]?.openToday;
  const open = typeof openTodayNum === "number" && Number.isFinite(openTodayNum) ? openTodayNum : closes[0];
  const close = closes[closes.length - 1];
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const range = high - low;
  const body = close! - open!;
  const upper = high - Math.max(open!, close!);
  const lower = Math.min(open!, close!) - low;

  // Simple shape detection
  let shape = "普通K线";
  const bodyAbs = Math.abs(body);
  if (range > 0) {
    const bodyRatio = bodyAbs / range;
    if (bodyRatio < 0.1) shape = "十字线/多空犹豫";
    else if (lower >= bodyAbs * 2 && upper <= bodyAbs) shape = "锤子线(底部信号可能)";
    else if (upper >= bodyAbs * 2 && lower <= bodyAbs) shape = "射击之星(顶部信号可能)";
    else if (body > 0 && bodyRatio > 0.6) shape = "大阳线(强势)";
    else if (body < 0 && bodyRatio > 0.6) shape = "大阴线(弱势)";
  }

  // Trend slope via simple linear regression on closes
  const n = closes.length;
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = closes.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (closes[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const trend = slope > 0 ? "上升" : slope < 0 ? "下降" : "横盘";

  // Moving averages and crossover
  const sma = (arr: number[], period: number): number | undefined => {
    if (arr.length < period) return undefined;
    const window = arr.slice(arr.length - period);
    return window.reduce((a, b) => a + b, 0) / period;
  };
  const maShort = sma(closes, 5);
  const maLong = sma(closes, 10);
  let maSignal = "无";
  if (maShort != null && maLong != null) {
    const prevShort = closes.length >= 6 ? sma(closes.slice(0, -1), 5) : undefined;
    const prevLong = closes.length >= 11 ? sma(closes.slice(0, -1), 10) : undefined;
    if (prevShort != null && prevLong != null) {
      const before = prevShort - prevLong;
      const now = (maShort as number) - (maLong as number);
      if (before <= 0 && now > 0) maSignal = "黄金交叉(偏多)";
      else if (before >= 0 && now < 0) maSignal = "死亡交叉(偏空)";
      else maSignal = now > 0 ? "短期强于长期(偏多)" : now < 0 ? "短期弱于长期(偏空)" : "持平";
    }
  }

  // RSI(14)
  const period = Math.min(14, closes.length);
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length && i < period + 1; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rs = losses > 0 ? gains / losses : Infinity;
  const rsi = losses > 0 ? 100 - (100 / (1 + rs)) : 100;

  // @ts-ignore
  return { open, high, low, close, range, body, upper, lower, shape, trend, slope, maShort, maLong, maSignal, rsi };
}

function summarizeKlineAnalysis(ana: KlineAnalysis | null): string {
  if (!ana) return "无有效期货数据或字段不完整，暂不分析。";
  const { open, high, low, close, shape, trend, maShort, maLong, maSignal, rsi } = ana;
  const lines = [
    // close 本来为收盘价的，不过直接在盘内判断了，改成最新价
    `当日K线：开盘 ${open}, 最高 ${high}, 最低 ${low}, 最新价 ${close}`,
    `形态判断：${shape}`,
    `趋势判断：${trend}`,
    typeof maShort === "number" && typeof maLong === "number" ? `均线：MA5=${maShort.toFixed(2)}, MA10=${maLong.toFixed(2)}；信号：${maSignal}` : `均线：样本不足，暂不判断`,
    `RSI(≤14)：${Number.isFinite(rsi) ? rsi.toFixed(2) : 'N/A'}(≥70偏热，≤30偏冷)`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function analyzeFuturesForDate(date: string): string {
  const p = futuresPathForDate(date);
  if (!fs.existsSync(p)) return "期货数据文件不存在，跳过分析。";
  try {
    const text = fs.readFileSync(p, "utf-8");
    const ticks = parseFuturesText(text);
    const ana = analyzeKline(ticks);
    return summarizeKlineAnalysis(ana) + `\n分析时间：${nowLocal()}`;
  } catch {
    return "期货数据解析失败，跳过分析。";
  }
}