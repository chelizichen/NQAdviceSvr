import express, { type Request, type Response } from "express";
import fs from "node:fs";
import { assetsPath } from "../lib/paths";

const router = express.Router();

// Global assets endpoints
router.get("/assets", (req: Request, res: Response) => {
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

router.put("/assets", (req: Request, res: Response) => {
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

export default router;