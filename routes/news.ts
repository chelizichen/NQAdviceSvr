import express, { type Request, type Response } from "express";
import { getFastNewsList } from "../service/NewsService";

const router = express.Router();

// 最新快讯新闻（轮询获取）
router.get("/news/latest", async (req: Request, res: Response) => {
  try {
     const content = await getFastNewsList();
    // 封装为 JSON，前端可直接渲染为 markdown/text
    res.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "news_fetch_failed", message });
  }
});

export default router;