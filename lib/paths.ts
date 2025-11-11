import path from "node:path";
import fs from "node:fs";

// Directory constants
export const POSITIONS_DIR = path.join(process.cwd(), "data", "positions");
export const FUTURES_DIR = path.join(process.cwd(), "data", "futures");
export const CHATS_DIR = path.join(process.cwd(), "data", "chats");
export const PUBLIC_DIR = path.join(process.cwd(), "public");

// Ensure required directories exist
export function ensureDirs() {
  // 保留 futures / chats / positions(用于 assets.json)
  const dirs = [POSITIONS_DIR, FUTURES_DIR, CHATS_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Path helpers with simple date sanitization
// 旧 advices 路径已移除

// 旧 notes/positions 路径已移除

export function assetsPath() {
  return path.join(POSITIONS_DIR, `assets.json`);
}
// 旧 news 路径已移除

export function futuresPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(FUTURES_DIR, `${safe}.txt`);
}

export function chatPathForDate(dateStr: string) {
  const safe = dateStr.replace(/[^0-9\-]/g, "");
  return path.join(CHATS_DIR, `${safe}.json`);
}