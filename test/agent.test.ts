import { Agent } from "../service/Agent";

new Agent().mixNews().then(res=>{
    console.log('res',res);
})