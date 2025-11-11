import axios  from "axios";
import moment from "moment";
import { NewsServiceError } from "./errors";

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

export function getLastTradeTime(){
    const tradeTime = moment().set({
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
    })
    console.log("currentTIme",moment().format("YYYY-MM-DD HH:mm:ss"));
    console.log('tradeTime', tradeTime.format("YYYY-MM-DD HH:mm:ss"));
    return tradeTime.valueOf()
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
        }) as any
        return data.data.fastNewsList.filter((v:any)=>moment(v.showTime).isAfter(lastTradeTime))
            .map((v:any)=>(`
                ${v.showTime}
                ${v.summary}
            `)).join("\n")
    } catch (error) {
        throw new NewsServiceError(`getFastNewsList error ${error}`)
    }

}


export { getFastNewsList }

// getFastNewsList().then(res=>{
//     console.log('res',res);
// })