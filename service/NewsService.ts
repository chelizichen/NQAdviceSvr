import axios  from "axios";
import moment from "moment";
import fs from "node:fs";
import path from "node:path";
import { NewsServiceError } from "./errors";
import { NEWS_SORT_DIR, newsSortPathForDate } from "../lib/paths";

// const req = 1761969988123
// let a = moment(req).format("YYYY-MM-DD HH:mm:ss")
// console.log('a',a);
 
const http = axios.create({
  baseURL: "https://np-weblist.eastmoney.com",
})

const HTTP_CALLBACK_MAP:Map<string,string> = new Map()

http.interceptors.request.use(req=>{
    const randomPart = Math.floor(Math.random() * 1e16).toString()
    req.params.callback = `jQuery${randomPart}_${moment().valueOf()}`
    HTTP_CALLBACK_MAP.set(req.url as string,req.params.callback)
    return req
})

http.interceptors.response.use(res=>{
    res.data = (res.data as string).replace(HTTP_CALLBACK_MAP.get(res.config.url as string) || "","")
    HTTP_CALLBACK_MAP.delete(res.config.url as string)
    return eval(res.data)
})

type GetFastNewsCountQuery = {
    client: string;
    biz: string;
    fastColumn: string;
    // sortStart: string;
    req_trace: string;
    _: string;
    pageSize: number;
    sortEnd: string;
}

// EastMoney fast news item typing
type FastNewsItem = {
    realSort: string | number;
    showTime: string | number;
    summary: string;
};

type FastNewsResponse = {
    data: {
        fastNewsList: FastNewsItem[];
    };
};

export function getLastTradeTime(){
    const todayStr = moment().format("YYYY-MM-DD");
    const datedPath = newsSortPathForDate(todayStr);
    let lastMs: number | null = null;
    let lastUs: number | null = null;
    try {
        // 优先读取通用文件 newssort/sort；不存在则尝试读取当日文件 newssort/YYYY-MM-DD.txt
        const sortFile = path.join(NEWS_SORT_DIR, "sort");
        if (fs.existsSync(sortFile)) {
            const raw = fs.readFileSync(sortFile, "utf-8").trim();
            const tsBig = Number(raw);
            if (Number.isFinite(tsBig) && tsBig > 0) {
                lastUs = tsBig; // 原始微秒级（或更大）时间戳
                lastMs = Math.floor(tsBig / 1000); // 剪掉末尾 3 位转为毫秒
            }
        } else if (fs.existsSync(datedPath)) {
            const raw = fs.readFileSync(datedPath, "utf-8").trim();
            const tsBig = Number(raw);
            if (Number.isFinite(tsBig) && tsBig > 0) {
                lastUs = tsBig;
                lastMs = Math.floor(tsBig / 1000);
            }
        }
    } catch {}

    if (lastMs == null) {
        // 默认：当日 00:00:00（本地时间）
        const tradeTime = moment().set({
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0
        });
        lastMs = tradeTime.valueOf();
        lastUs = lastMs * 1000; // 以微秒形式写入文件
    }

    // 每次覆盖写入到 newssort/YYYY-MM-DD.txt（统一每日生成）
    try {
        fs.mkdirSync(NEWS_SORT_DIR, { recursive: true });
        fs.writeFileSync(datedPath, String(lastUs ?? (lastMs * 1000)), "utf-8");
    } catch {}

    return lastMs;
}

async function getFastNewsList(){
    try {
        const query = {} as GetFastNewsCountQuery
        // const sortStart = 1761955112049170 // TODO 观察数据结构
        const fastColumn = 111 // 业务类型 101 为美国
        const biz = "web_724" // biz 为业务类型
        const client = "web"
        const lastTradeTime = getLastTradeTime()
        query._ = moment().valueOf().toString()
        // query.sortStart = sortStart.toString()
        query.fastColumn = fastColumn.toString()
        query.biz = biz
        query.client = client
        query.req_trace = lastTradeTime.toString()
        query.pageSize = 50;
        query.sortEnd = ""
        const data = await http({
            method: "get",
            url: "/comm/web/getFastNewsList",
            params: query
        }) as FastNewsResponse
        const list: FastNewsItem[] = data?.data?.fastNewsList ?? [];
        const maxSort = Math.max(...list.map((v: FastNewsItem) => Number(v.realSort)))
        // 写入到 newssort/YYYY-MM-DD.txt 里面（保存最新的 sort，用于下一次作为 lastTradeTime）
        try {
            const todayStr = moment().format("YYYY-MM-DD");
            const datedPath = newsSortPathForDate(todayStr);
            fs.mkdirSync(NEWS_SORT_DIR, { recursive: true });
            if (Number.isFinite(maxSort) && maxSort > 0) {
                fs.writeFileSync(datedPath, String(maxSort), "utf-8");
            }
        } catch {}

        return list
            .filter((v: FastNewsItem) => moment(v.showTime).isAfter(lastTradeTime))
            .map((v: FastNewsItem) => (`
                ${v.showTime}
                ${v.summary}
            `))
            .join("\n") || '无最新消息'
    } catch (error) {
        throw new NewsServiceError(`getFastNewsList error ${error}`)
    }

}

async function getTdyNewsList() {
    try {
        const query = {} as GetFastNewsCountQuery
        // const sortStart = 1761955112049170 // TODO 观察数据结构
        const fastColumn = 111 // 业务类型 101 为美国
        const biz = "web_724" // biz 为业务类型
        const client = "web"
        const tradeTime = moment().set({
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0
        });
        const lastTradeTime = tradeTime.valueOf();
        query._ = moment().valueOf().toString()
        // query.sortStart = sortStart.toString()
        query.fastColumn = fastColumn.toString()
        query.biz = biz
        query.client = client
        query.req_trace = lastTradeTime.toString()
        query.pageSize = 50;
        query.sortEnd = ""
        const data = await http({
            method: "get",
            url: "/comm/web/getFastNewsList",
            params: query
        }) as FastNewsResponse
        const list: FastNewsItem[] = data?.data?.fastNewsList ?? [];
       

        return list
            .filter((v: FastNewsItem) => moment(v.showTime).isAfter(lastTradeTime))
            .map((v: FastNewsItem) => (`
                ${v.showTime}
                ${v.summary}
            `))
            .join("\n") || '无最新消息'
    } catch (error) {
        throw new NewsServiceError(`getFastNewsList error ${error}`)
    } 
}


export { getFastNewsList,getTdyNewsList }

// getFastNewsList().then(res=>{
//     console.log('res',res);
// })