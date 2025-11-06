import { getFutures } from "./SinaNewsService";
import fs from "fs";
import path from "path";
import moment from "moment";


setInterval(()=>{
    // 打开一个文件流，将数据写入文件
    getFutures().then(res=>{
        if (!res) return; // 拉取失败，不写入
        const anyRes: any = res as any;
        const name = anyRes['名称'] ?? anyRes.name ?? anyRes.symbol ?? '';
        const nowPrice = anyRes['现价'] ?? anyRes.price ?? (anyRes.fields?.[1] ?? '');
        const buyPrice = anyRes['买价'] ?? (anyRes.fields?.[2] ?? '');
        const sellPrice = anyRes['卖价'] ?? (anyRes.fields?.[3] ?? '');
        const highPrice = anyRes['最高价'] ?? (anyRes.fields?.[4] ?? '');
        const lowPrice = anyRes['最低价'] ?? (anyRes.fields?.[5] ?? '');
        const today = anyRes['今日时间'] ?? '';
        const now = anyRes['当前时间'] ?? anyRes.at ?? '';
        const openPrice = anyRes['今日开盘价'] ?? (anyRes.fields?.[6] ?? '');

        const data = `名称:${name}|现价:${nowPrice}|买价:${buyPrice}|卖价:${sellPrice}|最高价:${highPrice}|最低价:${lowPrice}|今日时间:${today}|当前时间:${now}|今日开盘价:${openPrice}\n`;
        console.log('Schedule|写入期货数据:', data);
        const dir = path.join(process.cwd(), 'data', 'futures');
        const file = path.join(dir, `${moment().format('YYYY-MM-DD')}.txt`);
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.appendFileSync(file, data, { encoding: 'utf8' });
        } catch (err) {
          console.error('写入期货日志失败:', err);
        }
    })
},1000 * 60)