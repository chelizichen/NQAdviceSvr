import { GenerateService } from "./GenerateService";
import { OpenAIClient } from "./LLMService";
import { getFastNewsList } from "./NewsService";
import { getFutures } from "./SinaNewsService";
import path from 'path'
import fs from 'fs'
export class Agent{
    public static openai:OpenAIClient
    async generate(){
        if(!Agent.openai){
            Agent.openai = new OpenAIClient()
        }
        const newsList = await this.mixNews()
        console.log('newsList',newsList);
        // return null;
        const generateService = new GenerateService(Agent.openai)
        const result = await generateService.generate(newsList)
        return result
    }
    async mixNews():Promise<string>{
        const newsList = await getFastNewsList()
        const futures = await getFutures() as Record<string,number>
        let futuresStr = ''
        for (let k in futures){
            futuresStr += `${k}${futures[k]}\n`
        }
        return `
            新闻列表:${newsList}\n
            以下是当前期货价格
            ${futuresStr}
        `
    }

    writeNews(content:string){
        const cwd = process.cwd()
        const newsDir = path.join(cwd, "data", "news")
        const date = new Date().toISOString().split("T")[0]
        const fileName = path.join(newsDir, `${date}.txt`)
        fs.writeFileSync(fileName, content)
    }
}