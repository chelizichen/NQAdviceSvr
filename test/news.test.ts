// import { getFastNewsList } from "../service/NewsService";
import { getFutures } from "../service/SinaNewsService";
// getFastNewsList().then(res=>{
//     console.log('res',res);
// })

getFutures().then(res=>{
    console.log('res',res);
})