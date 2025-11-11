import express, { type Request, type Response } from "express";
import fs from "node:fs";
import moment from "moment";
import { FUTURES_DIR, futuresPathForDate } from "../lib/paths";

const router = express.Router();

// Futures listing
router.get("/futures", (req: Request, res: Response) => {
  const files = fs.existsSync(FUTURES_DIR)
    ? fs.readdirSync(FUTURES_DIR).filter((f) => f.endsWith(".txt"))
    : [];
  const dates = files.map((f) => f.replace(/\.txt$/, "")).sort();
  res.json({ dates });
});

// Futures data for a date -> K-line series
router.get("/futures/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const filePath = futuresPathForDate(date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const times: string[] = [];
    const closes: number[] = [];
    let name = "";
    let dayOpen: number | null = null;
    let lastClose: number | null = null; // 昨日收盘价
    for (const ln of lines) {
      // 解析每个键值对
      const map: Record<string, string> = {};
      for (const part of ln.split("|").map((s) => s.trim())) {
        const idx = part.indexOf(":");
        if (idx > 0) {
          const k = part.slice(0, idx);
          const v = part.slice(idx + 1);
          map[k] = v;
        }
      }
      if (!name) name = map["名称"] || "期货";
      const now = map["当前时间"] || "";
      const closeStr = map["现价"] || map["最新价"] || map["收盘价"] || "";
      const close = Number(closeStr);
      // 记录“今日开盘价”：按最新出现的值覆盖，确保跨时差场景使用当天开盘
      {
        const openStr = map["今日开盘价"] || map["开盘价"] || "";
        const openNum = Number(openStr);
        if (!Number.isNaN(openNum) && Number.isFinite(openNum)) {
          dayOpen = openNum; // 每次遇到有效值都覆盖，最终取最后一条记录
        }
      }
      // 记录“昨日收盘价”：按最新出现的值覆盖
      {
        const lastStr = map["昨日收盘价"] || "";
        const lastNum = Number(lastStr);
        if (!Number.isNaN(lastNum) && Number.isFinite(lastNum)) {
          lastClose = lastNum;
        }
      }
      if (!Number.isNaN(close)) {
        times.push(now);
        closes.push(close);
      }
    }
    // 由收盘序列合成每周期 OHLC：open=上一收盘，close=当前收盘，high/low=两者之间的极值
    const values: number[][] = [];
    for (let i = 0; i < closes.length; i++) {
      const prev = i > 0 ? closes[i - 1] : closes[i];
      const curr = closes[i];
      if (prev == null || curr == null) continue; // 防御性检查
      const open = Number(prev);
      const close = Number(curr);
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      values.push([open, close, low, high]);
    }
    res.json({ name, times, values, dayOpen, lastClose });
  } catch (err) {
    res.status(500).json({ error: "invalid_futures_format" });
  }
});

// Futures weekly aggregated data (Mon -> min(req_date, Fri))
router.get("/futures/week/:date", (req: Request<{ date: string }>, res: Response) => {
  const reqDate = req.params.date;
  try {
    const weekStart = moment(reqDate).startOf("isoWeek"); // Monday
    const weekEndTarget = moment(reqDate);
    const friday = moment(reqDate).startOf("isoWeek").add(5, "days");
    const end = weekEndTarget.isBefore(friday) ? weekEndTarget : friday;
    const days: string[] = [];
    for (let d = weekStart.clone(); !d.isAfter(end, "day"); d.add(1, "day")) {
      days.push(d.format("YYYY-MM-DD"));
    }
    let name = "期货";
    let mondayOpen: number | null = null;
    let weekLastClose: number | null = null;
    let weekLastCloseDate: string | null = null;
    const times: string[] = [];
    const values: number[][] = [];
    for (const day of days) {
      const filePath = futuresPathForDate(day);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const closes: number[] = [];
      let dayOpen: number | null = null;
      for (const ln of lines) {
        const map: Record<string, string> = {};
        for (const part of ln.split("|").map((s) => s.trim())) {
          const idx = part.indexOf(":");
          if (idx > 0) {
            const k = part.slice(0, idx);
            const v = part.slice(idx + 1);
            map[k] = v;
          }
        }
        if (!name) name = map["名称"] || name;
        const now = map["当前时间"] || "";
        const closeStr = map["现价"] || map["最新价"] || map["收盘价"] || "";
        const close = Number(closeStr);
        const openStr = map["今日开盘价"] || map["开盘价"] || "";
        const openNum = Number(openStr);
        if (!Number.isNaN(openNum) && Number.isFinite(openNum)) {
          dayOpen = openNum; // 覆盖到该日最新记录
        }
        if (!Number.isNaN(close)) {
          times.push(`${day} ${now}`);
          const prevMaybe = closes.length > 0 ? closes[closes.length - 1] : undefined;
          const open = Number(prevMaybe ?? close);
          const high = Math.max(open, close);
          const low = Math.min(open, close);
          values.push([open, close, low, high]);
          closes.push(close);
        }
      }
      const firstDay = days[0] ?? "";
      if (mondayOpen == null && dayOpen != null && day === firstDay) {
        mondayOpen = dayOpen;
      }
      if (closes.length > 0) {
        const lastClose = closes[closes.length - 1];
        if (typeof lastClose === 'number') {
          weekLastClose = lastClose;
          weekLastCloseDate = day;
        }
      }
    }
    let weeklyChange: number | null = null;
    let weeklyChangePct: number | null = null;
    if (mondayOpen != null && weekLastClose != null) {
      weeklyChange = Number((weekLastClose - mondayOpen).toFixed(2));
      weeklyChangePct = Number(((weeklyChange / mondayOpen) * 100).toFixed(2));
    }
    res.json({
      name,
      weekStart: weekStart.format("YYYY-MM-DD"),
      weekEnd: end.format("YYYY-MM-DD"),
      times,
      values,
      mondayOpen,
      weekLastClose,
      weekLastCloseDate,
      weeklyChange,
      weeklyChangePct,
    });
  } catch (err) {
    res.status(500).json({ error: "invalid_weekly_futures" });
  }
});

export default router;