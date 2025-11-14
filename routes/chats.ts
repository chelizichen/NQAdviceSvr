import express, { type Request, type Response } from "express";
import fs from "node:fs";
import { Agent } from "../service/Agent";
import { PromptAIStrategy } from "../service/Prompt";
import { assetsPath, chatPathForDate, CHATS_DIR, futuresPathForDate } from "../lib/paths";
import { OpenAIClient } from "../service/LLMService";
import { analyzeFuturesForDate } from "../service/KLineAnalyze";

const router = express.Router();

// ===== Helper types & pure functions =====
type AssetSnapshot = { entries: any[]; totalAssets: number };

// Pure formatter: given asset entries and total, produce snapshot text
function formatPositions(entries: any[], totalAssets: number): string {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const lines = entries.map((e: any) => {
    const t = e.time ? `@${e.time}` : "";
    if (e.assetName && Number.isFinite(Number(e.amount))) {
      const amount = Number(e.amount);
      const pct = totalAssets > 0 && amount >= 0 ? ((amount / totalAssets) * 100).toFixed(2) + "%" : "-";
      return `${t} 资产 ${e.assetName} 金额 ${amount}${pct !== '-' ? `，占比 ${pct}` : ''}`;
    }
    if (e.fundCode || e.fundName) {
      const name = e.fundName || "";
      const code = e.fundCode || e.code || "";
      const shares = e.shares ?? e.qty ?? e.volume ?? 0;
      const cost = e.cost ?? e.price ?? "-";
      const platform = e.platform || "";
      return `${t} 基金 ${name || code} 持有 ${shares} 份，平台 ${platform}，成本 ${cost}`;
    }
    if (e.symbol) {
      const sym = e.symbol;
      const side = (e.side || e.direction || '').toUpperCase() || '';
      const qty = e.qty ?? e.volume ?? 0;
      const price = e.cost ?? e.price ?? '-';
      return `${t} 合约 ${sym} ${side} ${qty} 手，均价 ${price}`;
    }
    return `${t} 未知项 ${JSON.stringify(e)}`;
  });
  const prefix = totalAssets > 0 ? `总资产：${totalAssets} 元\n` : "";
  return `仓位快照：\n${prefix}${lines.join("\n")}`;
}

// Read snapshot (impure I/O), then use pure formatter where needed
function readAssetSnapshot(aPath: string): AssetSnapshot | null {
  if (!fs.existsSync(aPath)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(aPath, "utf-8"));
    const entries = Array.isArray((json as any)?.entries) ? (json as any).entries : [];
    const totalAssetsRaw = (json as any)?.totalAssets;
    const totalAssets = Number.isFinite(Number(totalAssetsRaw)) ? Number(totalAssetsRaw) : 0;
    return { entries, totalAssets };
  } catch {
    return null;
  }
}

function buildPositionsMessageFromSnapshot(snapshot: AssetSnapshot | null): any | null {
  if (!snapshot || !snapshot.entries.length) return null;
  return { role: "system", content: formatPositions(snapshot.entries, snapshot.totalAssets) };
}

function buildPositionsSummaryFromSnapshot(snapshot: AssetSnapshot | null): string {
  if (!snapshot || !snapshot.entries.length) return "";
  return formatPositions(snapshot.entries, snapshot.totalAssets);
}

function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();
}

function getOpenAI(): OpenAIClient {
  const openai = (Agent as any).openai ?? new OpenAIClient();
  (Agent as any).openai = openai;
  return openai;
}

// Localized now string for prompt contexts
function nowLocal(): string {
  try { return new Date().toLocaleString('zh-CN', { hour12: false }); } catch { return new Date().toLocaleString(); }
}

function buildTimeContext(date: string): { role: "system"; content: string } {
  const nowStr = nowLocal();
  const content = `当前日期：${date}\n当前时间：${nowStr}\n`;
  return { role: "system", content };
}

async function accumulateCompletion(completion: any, onChunk?: (chunk: string) => void): Promise<string> {
  let text = "";
  const canStream = typeof Symbol !== 'undefined'
    && (Symbol as any).asyncIterator
    && typeof (completion as any)[(Symbol as any).asyncIterator] === 'function';
  if (canStream) {
    for await (const part of completion as any) {
      const delta = part?.choices?.[0]?.delta?.content ?? "";
      if (!delta) continue;
      text += delta;
      if (onChunk) onChunk(delta);
    }
  } else {
    text = (completion as any)?.choices?.[0]?.message?.content ?? "";
  }
  return text;
}

// Chats listing for sidebar highlighting
router.get("/chats", (req: Request, res: Response) => {
  const files = fs.existsSync(CHATS_DIR)
    ? fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const dates = files.map((f) => f.replace(/\.json$/, "")).sort();
  res.json({ dates });
});

function prevDateStr(date: string): string {
  // Compute previous day in LOCAL time and format as YYYY-MM-DD
  // Using toISOString() would convert to UTC and can shift the date
  // backward for UTC+ offsets (e.g., resulting in 2025-11-12 instead of 2025-11-13).
  const formatLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  try {
    const [yStr, mStr, dStr] = date.split("-");
    const y = Number(yStr), m = Number(mStr), day = Number(dStr);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) throw new Error("bad date");
    const dt = new Date(y, m - 1, day);
    dt.setDate(dt.getDate() - 1);
    return formatLocal(dt);
  } catch {
    const dt = new Date();
    dt.setDate(dt.getDate() - 1);
    return formatLocal(dt);
  }
}

// Sync previous day's chat to the given date, only if target date has no chat
router.post("/chat/:date/sync-previous", (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  const targetPath = chatPathForDate(date);
  if (fs.existsSync(targetPath)) {
    return res.status(409).json({ error: "already_exists", message: "该日期已有对话，无法同步上一天。" });
  }
  const prev = prevDateStr(date);
  const prevPath = chatPathForDate(prev);
  if (!fs.existsSync(prevPath)) {
    return res.status(404).json({ error: "prev_not_found", message: "上一天没有对话可同步。" });
  }
  try {
    const prevChat = JSON.parse(fs.readFileSync(prevPath, "utf-8"));
    const now = new Date().toISOString();
    const timeCtx = buildTimeContext(date);
    const newChat = {
      date,
      createdAt: now,
      updatedAt: now,
      messages: [timeCtx, ...(Array.isArray(prevChat?.messages) ? prevChat.messages : [])],
    };
    fs.writeFileSync(targetPath, JSON.stringify(newChat, null, 2), "utf-8");
    return res.json(newChat);
  } catch (err) {
    console.error("sync_previous_error", err);
    return res.status(500).json({ error: "sync_failed" });
  }
});

// Chat: get history
router.get("/chat/:date", (req: Request<{ date: string }>, res: Response) => {
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
router.post("/chat/start/:date", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  try {
    const agent = new Agent();
    const newsMixed = await agent.mixNews();
    const instructions = PromptAIStrategy;
    // positions snapshot（统一读取全局资产文件 assets.json）
    const snapshot = readAssetSnapshot(assetsPath());
    const positionsSummary = buildPositionsSummaryFromSnapshot(snapshot);
    const futuresSummary = analyzeFuturesForDate(date);
    const timeCtx = buildTimeContext(date);
    const opener = `阅读下面内容并结合我的仓位，给出投资建议；当没有明确信号时，请保持观望。\n\n${positionsSummary ? positionsSummary + "\n\n" : ""}${newsMixed}`;
    // Use shared OpenAI client via Agent to avoid multiple inits
    const openai = getOpenAI();
    const messages = [
      { role: "assistant", content: instructions },
      timeCtx,
      { role: "system", content: `期货K线分析：\n${futuresSummary}` },
      { role: "user", content: opener },
    ];
    const completion = await openai.generateWithList(messages as any);
    const advice = await accumulateCompletion(completion);
    const chat = {
      date,
      createdAt: new Date().toISOString(),
      messages: [
        { role: "assistant", content: instructions },
        timeCtx,
        { role: "system", content: `期货K线分析：\n${futuresSummary}` },
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
router.post("/chat/:date/message", async (req: Request<{ date: string }>, res: Response) => {
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
    const snapshot = readAssetSnapshot(assetsPath());
    const positionsMessage = buildPositionsMessageFromSnapshot(snapshot);
    const futuresSummary = analyzeFuturesForDate(date);
    const timeCtx = buildTimeContext(date);
    const summaryMsg = { role: "system", content: `期货K线分析：\n${futuresSummary}` } as any;
    const messages = positionsMessage
      ? [positionsMessage, timeCtx, summaryMsg, ...baseMessages, { role: "user", content: userText }]
      : [timeCtx, summaryMsg, ...baseMessages, { role: "user", content: userText }];
    const openai = getOpenAI();
    const completion = await openai.generateWithList(messages as any);
    const reply = await accumulateCompletion(completion);
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
router.get("/chat/:date/news/latest/stream", async (req: Request<{ date: string }>, res: Response) => {
  const date = req.params.date;
  initSSE(res);

  try {
    const agent = new Agent();
    const newsMixed = await agent.mixNews();

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
    const snapshot = readAssetSnapshot(assetsPath());
    const positionsMessage = buildPositionsMessageFromSnapshot(snapshot);
    const latestContent = newsMixed;
    const futuresSummary = analyzeFuturesForDate(date);
    const timeCtx = buildTimeContext(date);
    const summaryMsg = { role: "system", content: `期货K线分析：\n${futuresSummary}` }
    const messages = positionsMessage
      ? [positionsMessage, timeCtx, summaryMsg, ...baseMessages, { role: "user", content: "最新消息更新（自动）" }, { role: "system", content: latestContent }]
      : [timeCtx, summaryMsg, ...baseMessages, { role: "user", content: "最新消息更新（自动）" }, { role: "system", content: latestContent }];
    const openai = getOpenAI();
    const completion = await openai.generateWithList(messages as any);
    const reply = await accumulateCompletion(completion, (delta) => res.write(`data: ${delta}\n\n`));

    // finalize and persist with tag
    const userMsg = { role: "user", content: "最新消息更新（自动）" };
    const newsMsg = { role: "system", content: latestContent };
    const asstMsg = { role: "assistant", content: reply, tag: "latest_news" } as any;
    const persisted = [...baseMessages, userMsg, newsMsg,summaryMsg,timeCtx,asstMsg];
    const filePath2 = chatPathForDate(date);
    let chat2: any = null;
    if (fs.existsSync(filePath2)) {
      try { chat2 = JSON.parse(fs.readFileSync(filePath2, "utf-8")); } catch {}
    }
    if (!chat2) chat2 = { date, messages: [] };
    chat2.messages = persisted;
    chat2.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath2, JSON.stringify(chat2, null, 2), "utf-8");
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
router.get("/chat/:date/message/stream", async (req: Request<{ date: string }>, res: Response) => {
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
  initSSE(res);

  try {
    const chat = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const baseMessages = (chat?.messages as any[]) || [];
    // prepend positions context (not persisted) - read from assets.json only
    const snapshot = readAssetSnapshot(assetsPath());
    const positionsMessage = buildPositionsMessageFromSnapshot(snapshot);
    const futuresSummary = analyzeFuturesForDate(date);
    const timeCtx = buildTimeContext(date);
    const messages = positionsMessage
      ? [positionsMessage, timeCtx, { role: "system", content: `期货K线分析：\n${futuresSummary}` }, ...baseMessages, { role: "user", content: userText }]
      : [timeCtx, { role: "system", content: `期货K线分析：\n${futuresSummary}` }, ...baseMessages, { role: "user", content: userText }];
    const openai = getOpenAI();
    const completion = await openai.generateWithList(messages as any);
    const reply = await accumulateCompletion(completion, (delta) => res.write(`data: ${delta}\n\n`));
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

export default router;