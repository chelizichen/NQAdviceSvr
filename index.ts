import express, { type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import moment from "moment";
import dotenv from "dotenv";
import { Agent } from "./service/Agent";
import "./service/Schedule";
import { PromptAIStrategy } from "./service/Prompt";
const envPath = path.resolve(process.cwd(), "config.env");
dotenv.config({ path: envPath });
const app = express();

const DATA_DIR = path.join(process.cwd(), "data", "advices");
const NOTES_DIR = path.join(process.cwd(), "data", "notes");
const POSITIONS_DIR = path.join(process.cwd(), "data", "positions");
const NEWS_DIR = path.join(process.cwd(), "data", "news");
const FUTURES_DIR = path.join(process.cwd(), "data", "futures");
const CHATS_DIR = path.join(process.cwd(), "data", "chats");
const PUBLIC_DIR = path.join(process.cwd(), "public");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}
if (!fs.existsSync(POSITIONS_DIR)) {
  fs.mkdirSync(POSITIONS_DIR, { recursive: true });
}
if (!fs.existsSync(NEWS_DIR)) {
  fs.mkdirSync(NEWS_DIR, { recursive: true });
}
if (!fs.existsSync(FUTURES_DIR)) {
  fs.mkdirSync(FUTURES_DIR, { recursive: true });
}
if (!fs.existsSync(CHATS_DIR)) {
  fs.mkdirSync(CHATS_DIR, { recursive: true });
}
app.use(express.json());

function parseCookies(cookieHeader?: string) {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  cookieHeader.split(';').forEach(part => {
    const [k, v] = part.trim().split('=');
    if (k) map[k] = decodeURIComponent(v || '');
  });
  return map;
}

function isAuthenticated(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.auth === '1';
}

// Login & Logout endpoints
app.post('/login', (req: Request, res: Response) => {
  const username = String((req.body as any)?.username || '');
  const password = String((req.body as any)?.password || '');
  const envUser = process.env.MAIN_USERNAME || '';
  const envPass = process.env.MAIN_PASSWORD || '';
  if (username === envUser && password === envPass) {
    res.setHeader('Set-Cookie', 'auth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800');
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'invalid_credentials' });
});

app.post('/logout', (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', 'auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

// Auth gate: allow login routes and login.html, gate others
app.use((req: Request, res: Response, next) => {
  const allowPaths = ['/login', '/logout', '/login.html'];
  if (allowPaths.includes(req.path)) return next();
  if (isAuthenticated(req)) return next();
  // redirect to login page for non-API GET
  if (req.method === 'GET') return res.redirect('/login.html');
  return res.status(401).json({ error: 'unauthorized' });
});

// Static after auth gate
app.use(express.static(PUBLIC_DIR));

function advicePathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(DATA_DIR, `${safe}.txt`);
}
function notePathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(NOTES_DIR, `${safe}.txt`);
}
function positionsPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(POSITIONS_DIR, `${safe}.json`);
}
function assetsPath() {
  return path.join(POSITIONS_DIR, `assets.json`);
}
function newsPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(NEWS_DIR, `${safe}.txt`);
}
function futuresPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(FUTURES_DIR, `${safe}.txt`);
}
function chatPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(CHATS_DIR, `${safe}.json`);
}

app.get("/advices", (req: Request, res: Response) => {
  const files = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt"))
    : [];
  const dates = files.map((f) => f.replace(/\.txt$/, "")).sort();
  res.json({ dates });
});

app.get("/notes", (req: Request, res: Response) => {
  const files = fs.existsSync(NOTES_DIR)
    ? fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".txt"))
    : [];
  const dates = files.map((f) => f.replace(/\.txt$/, "")).sort();
  res.json({ dates });
});

// Positions listing
app.get("/positions", (req: Request, res: Response) => {
  const files = fs.existsSync(POSITIONS_DIR)
    ? fs.readdirSync(POSITIONS_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const dates = files.map((f) => f.replace(/\.json$/, "")).sort();
  res.json({ dates });
});

app.get("/news", (req: Request, res: Response) => {
  const files = fs.existsSync(NEWS_DIR)
    ? fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith(".txt"))
    : [];
  const dates = files.map((f) => f.replace(/\.txt$/, "")).sort();
  res.json({ dates });
});

// Global assets endpoints
app.get("/assets", (req: Request, res: Response) => {
  try {
    const aPath = assetsPath();
    if (!fs.existsSync(aPath)) return res.json({ entries: [], totalAssets: 0 });
    const json = JSON.parse(fs.readFileSync(aPath, "utf-8"));
    const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
    const totalAssetsRaw = (json as any)?.totalAssets;
    const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
    res.json({ entries, totalAssets, updatedAt: (json as any)?.updatedAt || null });
  } catch (err) {
    res.status(500).json({ error: "invalid_assets_format" });
  }
});
app.put("/assets", (req: Request, res: Response) => {
  try {
    const entries = (req.body as any)?.entries;
    const totalAssetsRaw = (req.body as any)?.totalAssets;
    if (!Array.isArray(entries)) return res.status(400).json({ error: "entries_required" });
    const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
    const payload = { updatedAt: new Date().toISOString(), entries, totalAssets };
    const aPath = assetsPath();
    fs.writeFileSync(aPath, JSON.stringify(payload, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "assets_write_failed" });
  }
});

// Futures listing
app.get("/futures", (req: Request, res: Response) => {
  const files = fs.existsSync(FUTURES_DIR)
    ? fs.readdirSync(FUTURES_DIR).filter((f) => f.endsWith(".txt"))
    : [];
  const dates = files.map((f) => f.replace(/\.txt$/, "")).sort();
  res.json({ dates });
});

app.get("/advices/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const filePath = advicePathForDate(date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  const content = fs.readFileSync(filePath, "utf-8");
  res.type("text/plain").send(content);
});

app.get("/notes/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const filePath = notePathForDate(date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  const content = fs.readFileSync(filePath, "utf-8");
  res.type("text/plain").send(content);
});

app.get("/positions/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const filePath = positionsPathForDate(date);
  try {
    if (fs.existsSync(filePath)) {
      const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
      const totalAssetsRaw = (json as any)?.totalAssets;
      const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
      return res.json({ entries, totalAssets });
    }
    // fallback to global assets
    const aPath = assetsPath();
    if (fs.existsSync(aPath)) {
      const json = JSON.parse(fs.readFileSync(aPath, "utf-8"));
      const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
      const totalAssetsRaw = (json as any)?.totalAssets;
      const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
      return res.json({ entries, totalAssets });
    }
    return res.json({ entries: [], totalAssets: 0 });
  } catch (err) {
    res.status(500).json({ error: "invalid_positions_format" });
  }
});

app.get("/news/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const filePath = newsPathForDate(date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: "invalid_news_format" });
  }
});

// Chats listing for sidebar highlighting
app.get("/chats", (req: Request, res: Response) => {
  const files = fs.existsSync(CHATS_DIR)
    ? fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const dates = files.map((f) => f.replace(/\.json$/, "")).sort();
  res.json({ dates });
});

// Futures data for a date -> K-line series
app.get("/futures/:date", (req: Request<{ date: string }>, res: Response) => {
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
    res.json({ name, times, values, dayOpen });
  } catch (err) {
    res.status(500).json({ error: "invalid_futures_format" });
  }
});

// Futures weekly aggregated data (Mon -> min(req_date, Fri))
app.get("/futures/week/:date", (req: Request<{ date: string }>, res: Response) => {
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

app.put("/notes/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const filePath = notePathForDate(date);
  fs.writeFileSync(filePath, content, "utf-8");
  res.json({ ok: true });
});

app.put("/positions/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const entries = (req.body as any)?.entries;
  const totalAssetsRaw = (req.body as any)?.totalAssets;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "entries_required" });
  }
  const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
  const payload: any = { date, updatedAt: new Date().toISOString(), entries };
  if (totalAssets >= 0) payload.totalAssets = totalAssets;
  const filePath = positionsPathForDate(date);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  res.json({ ok: true });
});

app.get("/stream/:date", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const today = moment().format("YYYY-MM-DD");
  if (date !== today) {
    res.status(400).json({ error: "only_today_supported" });
    return;
  }
  // 如果存在则直接返回
  if (fs.existsSync(advicePathForDate(date))) {
    res.status(400).json({ error: "already_generated" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  const filePath = advicePathForDate(date);
  const stream = fs.createWriteStream(filePath, { flags: "a" });

  try {
    const agent = new Agent();
    const completion = await agent.generate();
    if (!completion) {
      throw new Error("no_completion");
    }
    const canStream = typeof Symbol !== 'undefined'
      && (Symbol as any).asyncIterator
      && typeof (completion as any)[(Symbol as any).asyncIterator] === 'function';

    if (canStream) {
      for await (const part of completion as any) {
        const delta = part?.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        stream.write(delta);
        res.write(`data: ${delta}\n\n`);
      }
    } else {
      const text = (completion as any)?.choices?.[0]?.message?.content ?? "";
      if (text) {
        stream.write(text);
        res.write(`data: ${text}\n\n`);
      } else {
        throw new Error("completion_not_stream_or_text");
      }
    }
    stream.end();
    res.write("event: done\n");
    res.write("data: end\n\n");
    res.end();
  } catch (err) {
    console.log("error", err);
    stream.end();
    res.write("event: error\n");
    res.write(`data: ${JSON.stringify({ message: (err as Error)?.message || "error" })}\n\n`);
    res.end();
  }
});

// Chat: get history
app.get("/chat/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const filePath = chatPathForDate(date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  try {
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: "invalid_chat_format" });
  }
});

// Chat: start conversation by generating advice from latest news
app.post("/chat/start/:date", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  try {
    const agent = new Agent();
    const newsMixed = await agent.mixNews();
    agent.writeNews(newsMixed)
    const instructions = PromptAIStrategy;
    // positions snapshot（统一读取全局资产文件 assets.json）
    let positionsSummary = "";
    const aPath = assetsPath();
    const readAssets = (p: string) => {
      const json = JSON.parse(fs.readFileSync(p, "utf-8"));
      const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
      const totalAssetsRaw = (json as any)?.totalAssets;
      const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
      return { entries, totalAssets };
    };
    try {
      const { entries, totalAssets } = fs.existsSync(aPath)
        ? readAssets(aPath)
        : { entries: [], totalAssets: 0 };
      if (entries.length) {
        const lines = entries.map((e: any) => {
            const t = e.time ? `@${e.time}` : "";
            if (e.assetName && Number.isFinite(Number(e.amount))) {
              const amount = Number(e.amount);
              const pct = (totalAssets > 0 && amount >= 0) ? ((amount / totalAssets) * 100).toFixed(2) + '%' : '-';
              return `${t} 资产 ${e.assetName} 金额 ${amount}${pct !== '-' ? `，占比 ${pct}` : ''}`;
            }
            if (e.fundCode || e.fundName) {
              const name = e.fundName || "";
              const code = e.fundCode || e.code || "";
              const shares = e.shares ?? e.qty ?? e.volume ?? 0;
              const cost = e.cost ?? e.price ?? "-";
              const platform = e.platform || "";
              return `${t} 基金 ${name || code} 持有 ${shares} 份，成本净值 ${cost}${platform ? `（平台：${platform}）` : ""}`;
            }
            const sym = e.symbol || e.code || "合约";
            const side = e.side || "方向";
            const qty = e.qty || e.volume || 0;
            const price = e.price ?? "-";
            return `${t} ${sym} ${side} ${qty} 手，均价 ${price}`;
        });
        positionsSummary = `当前仓位：\n${totalAssets > 0 ? `总资产：${totalAssets} 元\n` : ''}${lines.join("\n")}`;
      }
    } catch {}
    const opener = `阅读下面内容并结合我的仓位，给出投资建议；当没有明确信号时，请保持观望。\n\n${positionsSummary ? positionsSummary + "\n\n" : ""}${newsMixed}`;
    // Use shared OpenAI client via Agent to avoid multiple inits
    const openai = (Agent as any).openai ?? new (require("./service/LLMService").OpenAIClient)();
    (Agent as any).openai = openai;
    const messages = [
      { role: "assistant", content: instructions },
      { role: "user", content: opener },
    ];
    const completion = await openai.generateWithList(messages as any);
    let advice = "";
    const canStream = typeof Symbol !== 'undefined'
      && (Symbol as any).asyncIterator
      && typeof (completion as any)[(Symbol as any).asyncIterator] === 'function';
    if (canStream) {
      for await (const part of completion as any) {
        const delta = part?.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        advice += delta;
      }
    } else {
      advice = (completion as any)?.choices?.[0]?.message?.content ?? "";
    }
    const chat = {
      date,
      createdAt: new Date().toISOString(),
      messages: [
        { role: "assistant", content: instructions },
        { role: "user", content: opener },
        { role: "assistant", content: advice },
      ],
    };
    fs.writeFileSync(chatPathForDate(date), JSON.stringify(chat, null, 2), "utf-8");
    res.json(chat);
  } catch (err) {
    console.error("chat_start_error", err);
    res.status(500).json({ error: "chat_start_failed" });
  }
});

// Chat: continue conversation
app.post("/chat/:date/message", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const userText = String((req.body as any)?.text || "").trim();
  if (!userText) return res.status(400).json({ error: "empty_text" });
  const filePath = chatPathForDate(date);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not_found" });
  }
  try {
    const chat = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const baseMessages = (chat?.messages as any[]) || [];
    // prepend positions context (not persisted) - read from assets.json only
    let positionsMessage: any = null;
    const aPath = assetsPath();
    if (fs.existsSync(aPath)) {
      try {
        const json = JSON.parse(fs.readFileSync(aPath, "utf-8"));
        const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
        const totalAssetsRaw = (json as any)?.totalAssets;
        const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
        if (entries.length) {
          const lines = entries.map((e: any) => {
            const t = e.time ? `@${e.time}` : "";
            if (e.assetName && Number.isFinite(Number(e.amount))) {
              const amount = Number(e.amount);
              const pct = (totalAssets > 0 && amount >= 0) ? ((amount / totalAssets) * 100).toFixed(2) + '%' : '-';
              return `${t} 资产 ${e.assetName} 金额 ${amount}${pct !== '-' ? `，占比 ${pct}` : ''}`;
            }
            if (e.fundCode || e.fundName) {
              const name = e.fundName || "";
              const code = e.fundCode || e.code || "";
              const shares = e.shares ?? e.qty ?? e.volume ?? 0;
              const cost = e.cost ?? e.price ?? "-";
              const platform = e.platform || "";
              return `${t} 基金 ${name || code} 持有 ${shares} 份，成本净值 ${cost}${platform ? `（平台：${platform}）` : ""}`;
            }
            const sym = e.symbol || e.code || "合约";
            const side = e.side || "方向";
            const qty = e.qty || e.volume || 0;
            const price = e.price ?? "-";
            return `${t} ${sym} ${side} ${qty} 手，均价 ${price}`;
          });
          positionsMessage = { role: "system", content: `仓位快照：\n${totalAssets > 0 ? `总资产：${totalAssets} 元\n` : ''}${lines.join("\n")}` };
        }
      } catch {}
    }
    const messages = positionsMessage ? [positionsMessage, ...baseMessages, { role: "user", content: userText }] : [...baseMessages, { role: "user", content: userText }];
    const openai = (Agent as any).openai ?? new (require("./service/LLMService").OpenAIClient)();
    (Agent as any).openai = openai;
    const completion = await openai.generateWithList(messages as any);
    let reply = "";
    const canStream = typeof Symbol !== 'undefined'
      && (Symbol as any).asyncIterator
      && typeof (completion as any)[(Symbol as any).asyncIterator] === 'function';
    if (canStream) {
      for await (const part of completion as any) {
        const delta = part?.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        reply += delta;
      }
    } else {
      reply = (completion as any)?.choices?.[0]?.message?.content ?? "";
    }
    const persisted = [...baseMessages, { role: "user", content: userText }, { role: "assistant", content: reply }];
    chat.messages = persisted;
    chat.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), "utf-8");
    res.json(chat);
  } catch (err) {
    console.error("chat_continue_error", err);
    res.status(500).json({ error: "chat_message_failed" });
  }
});

// Chat: stream incremental advice based on latest news (SSE)
app.get("/chat/:date/news/latest/stream", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  try {
    const agent = new Agent();
    const newsMixed = await agent.mixNews();
    agent.writeNews(newsMixed);

    const filePath = chatPathForDate(date);
    let chat: any = null;
    if (fs.existsSync(filePath)) {
      try { chat = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch {}
    }
    if (!chat) {
      chat = {
        date,
        createdAt: new Date().toISOString(),
        messages: [
          { role: "assistant", content: PromptAIStrategy },
        ],
      };
    }
    const baseMessages = (chat?.messages as any[]) || [];

    // prepend positions context (not persisted) - read from assets.json only
    let positionsMessage: any = null;
    const aPath = assetsPath();
    if (fs.existsSync(aPath)) {
      try {
        const json = JSON.parse(fs.readFileSync(aPath, "utf-8"));
        const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
        const totalAssetsRaw = (json as any)?.totalAssets;
        const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
        if (entries.length) {
          const lines = entries.map((e: any) => {
            const t = e.time ? `@${e.time}` : "";
            if (e.assetName && Number.isFinite(Number(e.amount))) {
              const amount = Number(e.amount);
              const pct = (totalAssets > 0 && amount >= 0) ? ((amount / totalAssets) * 100).toFixed(2) + '%' : '-';
              return `${t} 资产 ${e.assetName} 金额 ${amount}${pct !== '-' ? `，占比 ${pct}` : ''}`;
            }
            if (e.fundCode || e.fundName) {
              const name = e.fundName || "";
              const code = e.fundCode || e.code || "";
              const shares = e.shares ?? e.qty ?? e.volume ?? 0;
              const cost = e.cost ?? e.price ?? "-";
              const platform = e.platform || "";
              return `${t} 基金 ${name || code} 持有 ${shares} 份，成本净值 ${cost}${platform ? `（平台：${platform}）` : ""}`;
            }
            const sym = e.symbol || e.code || "合约";
            const side = e.side || "方向";
            const qty = e.qty || e.volume || 0;
            const price = e.price ?? "-";
            return `${t} ${sym} ${side} ${qty} 手，均价 ${price}`;
          });
          positionsMessage = { role: "system", content: `仓位快照：\n${totalAssets > 0 ? `总资产：${totalAssets} 元\n` : ''}${lines.join("\n")}` };
        }
      } catch {}
    }

    const openai = (Agent as any).openai ?? new (require("./service/LLMService").OpenAIClient)();
    (Agent as any).openai = openai;
    const GenerateService = require("./service/GenerateService").GenerateService;
    const gen = new GenerateService();
    const latestContent = await gen.mixContent(newsMixed);
    const messages = [
      ...(positionsMessage ? [positionsMessage] : []),
      ...baseMessages,
      { role: "system", content: latestContent },
      { role: "user", content: "请结合最新消息生成增量建议，避免重复旧信息；无新信号则保持观望。" },
    ];

    const completion = await openai.generateWithList(messages as any);
    let reply = "";
    const canStream = typeof Symbol !== 'undefined'
      && (Symbol as any).asyncIterator
      && typeof (completion as any)[(Symbol as any).asyncIterator] === 'function';
    if (canStream) {
      for await (const part of completion as any) {
        const delta = part?.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        reply += delta;
        res.write(`data: ${delta}\n\n`);
      }
    } else {
      const text = (completion as any)?.choices?.[0]?.message?.content ?? "";
      if (text) {
        reply += text;
        res.write(`data: ${text}\n\n`);
      } else {
        throw new Error("completion_not_stream_or_text");
      }
    }

    // finalize and persist with tag
    const userMsg = { role: "user", content: "最新消息更新（自动）" };
    const asstMsg = { role: "assistant", content: reply, tag: "latest_news" } as any;
    const persisted = [...baseMessages, userMsg, asstMsg];
    chat.messages = persisted;
    chat.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), "utf-8");
    res.write("event: done\n");
    res.write("data: end\n\n");
    res.end();
  } catch (err) {
    console.error("chat_latest_news_stream_error", err);
    res.write("event: error\n");
    res.write(`data: ${JSON.stringify({ message: (err as Error)?.message || "error" })}\n\n`);
    res.end();
  }
});

// Chat: stream reply while sending a message (SSE)
app.get("/chat/:date/message/stream", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const userText = String((req.query as any)?.text || "").trim();
  if (!userText) {
    res.status(400).json({ error: "empty_text" });
    return;
  }
  const filePath = chatPathForDate(date);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  try {
    const chat = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const baseMessages = (chat?.messages as any[]) || [];
    // prepend positions context (not persisted) - read from assets.json only
    let positionsMessage: any = null;
    const aPath = assetsPath();
    if (fs.existsSync(aPath)) {
      try {
        const json = JSON.parse(fs.readFileSync(aPath, "utf-8"));
        const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
        const totalAssetsRaw = (json as any)?.totalAssets;
        const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
        if (entries.length) {
          const lines = entries.map((e: any) => {
            const t = e.time ? `@${e.time}` : "";
            if (e.assetName && Number.isFinite(Number(e.amount))) {
              const amount = Number(e.amount);
              const pct = (totalAssets > 0 && amount >= 0) ? ((amount / totalAssets) * 100).toFixed(2) + '%' : '-';
              return `${t} 资产 ${e.assetName} 金额 ${amount}${pct !== '-' ? `，占比 ${pct}` : ''}`;
            }
            if (e.fundCode || e.fundName) {
              const name = e.fundName || "";
              const code = e.fundCode || e.code || "";
              const shares = e.shares ?? e.qty ?? e.volume ?? 0;
              const cost = e.cost ?? e.price ?? "-";
              const platform = e.platform || "";
              return `${t} 基金 ${name || code} 持有 ${shares} 份，成本净值 ${cost}${platform ? `（平台：${platform}）` : ""}`;
            }
            const sym = e.symbol || e.code || "合约";
            const side = e.side || "方向";
            const qty = e.qty || e.volume || 0;
            const price = e.price ?? "-";
            return `${t} ${sym} ${side} ${qty} 手，均价 ${price}`;
          });
          positionsMessage = { role: "system", content: `仓位快照：\n${totalAssets > 0 ? `总资产：${totalAssets} 元\n` : ''}${lines.join("\n")}` };
        }
      } catch {}
    }
    const messages = positionsMessage ? [positionsMessage, ...baseMessages, { role: "user", content: userText }] : [...baseMessages, { role: "user", content: userText }];
    const openai = (Agent as any).openai ?? new (require("./service/LLMService").OpenAIClient)();
    (Agent as any).openai = openai;
    const completion = await openai.generateWithList(messages as any);
    let reply = "";
    const canStream = typeof Symbol !== 'undefined'
      && (Symbol as any).asyncIterator
      && typeof (completion as any)[(Symbol as any).asyncIterator] === 'function';
    if (canStream) {
      for await (const part of completion as any) {
        const delta = part?.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        reply += delta;
        res.write(`data: ${delta}\n\n`);
      }
    } else {
      const text = (completion as any)?.choices?.[0]?.message?.content ?? "";
      if (text) {
        reply += text;
        res.write(`data: ${text}\n\n`);
      } else {
        throw new Error("completion_not_stream_or_text");
      }
    }
    // finalize and persist
    const persisted = [...baseMessages, { role: "user", content: userText }, { role: "assistant", content: reply }];
    chat.messages = persisted;
    chat.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), "utf-8");
    res.write("event: done\n");
    res.write("data: end\n\n");
    res.end();
  } catch (err) {
    console.error("chat_stream_error", err);
    res.write("event: error\n");
    res.write(`data: ${JSON.stringify({ message: (err as Error)?.message || "error" })}\n\n`);
    res.end();
  }
});

const port = process.env.SGRID_TARGET_PORT ? Number(process.env.SGRID_TARGET_PORT) : 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
