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
    lastPrice
    ,openPrice,____,_____,______,
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
    '昨日收盘价':lastPrice,
  }
};

export { getFutures };


type USCategoryListParams = {
  page?: number;
  num?: number;
  sort?: string; // 排序字段，空字符串表示默认
  asc?: 0 | 1;   // 0 降序，1 升序
  market?: string; // 市场标识：O(NASDAQ)、N(NYSE) 等
  id?: string;     // 分类 id，可为空
};

const getNqStockHq = async (params: USCategoryListParams = {}) => {
  // content-type: application/javascript; charset=gbk
  const {
    page = 1,
    num = 20,
    sort = "",
    asc = 0,
    market = "O",
    id = "",
  } = params;

  // 该接口采用 JSONP，回调名嵌于路径中；生成一个随机回调占位
  const callbackId = `g${Math.random().toString(36).slice(2)}`;
  const url = `https://stock.finance.sina.com.cn/usstock/api/jsonp.php/IO.XSRV2.CallbackList['${callbackId}']/US_CategoryService.getList`;

  const resp = await axios.get(url, {
    params: { page, num, sort, asc, market, id },
    responseType: "arraybuffer",
    headers: {
      referer: "https://finance.sina.com.cn/stock/usstock/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    },
  });

  // GBK/GB18030 解码
  const buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data as any);
  const text = iconv.decode(buf, "GB18030");

  // 提取 JSONP 中的对象：IO.XSRV2.CallbackList['xxx']({...})
  const lparen = text.indexOf("(");
  const rparen = text.lastIndexOf(")");
  if (lparen < 0 || rparen < 0 || rparen <= lparen) {
    throw new Error("JSONP 格式异常，未找到包裹的对象");
  }
  const jsonStr = text.slice(lparen + 1, rparen);
  const parsed = JSON.parse(jsonStr);

  // 返回数据数组（股票列表），若不存在则返回空数组
  return parsed?.data ?? [];
};

export { getNqStockHq };