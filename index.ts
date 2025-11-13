import express from "express";
import dotenv from "dotenv";
import "./service/Schedule";

import { PUBLIC_DIR as PUB_DIR, ensureDirs } from "./lib/paths";
import { authGate } from "./lib/auth";

import authRouter from "./routes/auth";
import futuresRouter from "./routes/futures";
import stockHqRouter from "./routes/stockHq";
import assetsRouter from "./routes/assets";
import chatsRouter from "./routes/chats";

const envPath = require("node:path").resolve(process.cwd(), "config.env");
dotenv.config({ path: envPath });

const app = express();
app.use(express.json());

// 确保数据目录存在
ensureDirs();

// 先挂载鉴权路由，再挂载鉴权门禁
app.use(authRouter);
app.use(authGate);

// 静态资源目录
app.use(express.static(PUB_DIR));

// 业务路由模块
app.use(futuresRouter);
app.use(stockHqRouter);
app.use(assetsRouter);
app.use(chatsRouter);

const port = process.env.SGRID_TARGET_PORT ? Number(process.env.SGRID_TARGET_PORT) : 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});