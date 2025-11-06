import express, { type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import moment from "moment";
import dotenv from "dotenv";
import { Agent } from "./service/Agent";
import "./service/Schedule";
const envPath = path.resolve(process.cwd(), "config.env");
dotenv.config({ path: envPath });
const app = express();

const DATA_DIR = path.join(process.cwd(), "data", "advices");
const NOTES_DIR = path.join(process.cwd(), "data", "notes");
const NEWS_DIR = path.join(process.cwd(), "data", "news");
const FUTURES_DIR = path.join(process.cwd(), "data", "futures");
const PUBLIC_DIR = path.join(process.cwd(), "public");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}
if (!fs.existsSync(NEWS_DIR)) {
  fs.mkdirSync(NEWS_DIR, { recursive: true });
}
if (!fs.existsSync(FUTURES_DIR)) {
  fs.mkdirSync(FUTURES_DIR, { recursive: true });
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
function newsPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(NEWS_DIR, `${safe}.txt`);
}
function futuresPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(FUTURES_DIR, `${safe}.txt`);
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

app.get("/news", (req: Request, res: Response) => {
  const files = fs.existsSync(NEWS_DIR)
    ? fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith(".txt"))
    : [];
  const dates = files.map((f) => f.replace(/\.txt$/, "")).sort();
  res.json({ dates });
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

app.put("/notes/:date", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const filePath = notePathForDate(date);
  fs.writeFileSync(filePath, content, "utf-8");
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

const port = process.env.SGRID_TARGET_PORT ? Number(process.env.SGRID_TARGET_PORT) : 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
