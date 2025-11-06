import axios from "axios";
import iconv from "iconv-lite";

const http = axios.create({
  baseURL: "https://hq.sinajs.cn/etag.php",
});

// 脚本使用 bunrun test/news.test.ts（此处兼容 Node 环境）
const getFutures = async () => {
  const resp = await http({
    method: "get",
    params: {
      list: "hf_NQ",
      // _: moment().valueOf().toString(), // 接口有，但是这里不需要好像
    },
    responseType: "arraybuffer",
    headers: {
      host: "hq.sinajs.cn",
      referer: "https://finance.sina.com.cn/futures/quotes/NQ.shtml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    },
  });
  const buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data as any);
  const text = iconv.decode(buf, "GB18030") ;
  console.log('text',text);
  const values = text.match(/"([^"]+)"/) as Array<any>
  console.log('values',values[1].split(","));
  const [
    nowPrice,
    _,
    buyPrice,
    sellPrice,
    highPrice,
    lowPrice,
    now,
    __,openPrice,____,_____,______,
    today,
    name
  ] = values[1].split(',')
  console.log('nowPrice',nowPrice);
  console.log('buyPrice',buyPrice);
  console.log('sellPrice',sellPrice);
  console.log('highPrice',highPrice);
  console.log('lowPrice',lowPrice);
  console.log('now',now);
  console.log('today',today);
  console.log('name',name);
  
  return {
    '名称':name,
    '现价':nowPrice,
    '买价':buyPrice,
    '卖价':sellPrice,
    '最高价':highPrice,
    '最低价':lowPrice,
    '今日时间':today,
    '当前时间':now,
    '今日开盘价':openPrice,
  }
};

export { getFutures };