import express, { type Request, type Response } from "express";
import { getNqStockHq } from "../service/SinaNewsService";

const router = express.Router();


const filterStock = [
    "谷歌A类股",
    "领航 国际股票 ETF",
    "奈飞公司",
    "开市客公司",
    "思科系统公司",
    '直觉外科公司',
    "林氏研究公司",
    '拼多多公司',
    '财捷集团',
]

// Real-time US stock quotes (NASDAQ by default)
// GET /stockhq?page=1&num=20&market=O&sort=&asc=0&id=
router.get("/stockhq", async (req: Request, res: Response) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const num = req.query.num ? Number(req.query.num) : 20;
    const sort = typeof req.query.sort === "string" ? req.query.sort : "";
    const asc = req.query.asc ? Number(req.query.asc) : 0;
    const market = typeof req.query.market === "string" ? req.query.market : "O";
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const list = await getNqStockHq({ page, num, sort, asc: asc as 0 | 1, market, id });
    const normalized = (Array.isArray(list) ? list : []).map((it: any) => {
      const raw = Number(it?.mktcap ?? NaN);
      const billion = Number.isFinite(raw) ? raw / 1e8 : null; // 转为“亿”
      return {
        ...it,
        mktcap: raw, // 保留原始数值（Number）
        mktcap_billion: billion != null ? Number(billion.toFixed(2)) : null,
        mktcap_display: billion != null ? `${billion.toFixed(2)} 亿` : "-",
      };
    });
    const filtered = normalized.filter((it: any) => {
      const cn = String(it?.cname ?? "");
      const en = String(it?.name ?? "");
      return !filterStock.some((s) => cn.includes(s) || en.includes(s));
    });
    res.json({ data: filtered });
  } catch (err) {
    res.status(500).json({ error: "stockhq_fetch_failed" });
  }
});

export default router;