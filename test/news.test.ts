import { getFastNewsList } from "../service/NewsService";
import { getFutures,getNqStockHq } from "../service/SinaNewsService";
getFastNewsList().then(res=>{
    // console.log('res',res);
})

// getFutures().then(res=>{
//     console.log('res',res);
// })

// getNqStockHq().then(res=>{
//     console.log('res',res);
// })