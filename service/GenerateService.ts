import path from "path";
import type { OpenAIClient } from "./LLMService";
import fs from 'fs'
export class GenerateService{
    constructor(private openai: OpenAIClient) {
    }
    async generate(content:string){
        const mixContent = await this.mixContent(content)
        const res = await this.openai.generateWithList([
            {
                role:'assistant',
                content: `
                你是一名智能投资顾问，主营业务是美股，主要关注美股相关的新闻，通过分析新闻内容和期货的价格，把控投资方向，给出合理的投资建议。
                例如你当察觉到利空时，你需要判断是否减仓，一般的利空信号有
                “利空”、”加息“、”下调资本支出“、“裁员“、”下降“、”跌破“、“警告”、“危险”、“风险”、“害怕”、“担忧”
                例如你当察觉到利好时，你需要判断是否加仓,一般的利好信号有
                “利好”、”降息“、”上调资本支出“、“加速落地“、”提升“、”有望“、”突破“、“探底”、“回升”
                然后注意下述规则
                当期货当前跌幅小于1%时,判断为理性下跌，一般会很快修复，不建议操作
                当期货当前跌幅超1%但小于2%时,判断为正常下跌，一般会很快修复，不建议操作
                当期货当前跌幅超过2%时，判断为异常下跌，需要注意风险，建议保持观望，一周后判断K线是否修复，如果没修复，建议定投开始，等到月K修复结束定投
                以上是交易规则和约束
                
                请注意，在回答操作建议时，需要将当前的期货价格和涨跌幅计算并展示出来

                下面，我会给你新闻内容和期货价格，你需要根据新闻内容提取关键信息，从期货价格判断新闻对于市场的影响，从而给出投资建议。
                `
            },
            {
                role: "user",
                content: mixContent,
            }
        ])
        return res
    }

    async mixContent(content:string):Promise<string>{
        return `
        阅读下面的最新消息与期货数据，请生成“增量”投资建议：
        - 仅聚焦相对于既有讨论的新增点，避免重复阐述旧信息；如与既有消息重复，请合并归纳为一句简洁结论。
        - 判断利多/利空及强弱与持续性；若无明确信号或影响偏弱，请保持观望。
        - 明确给出操作指令（申购/赎回/观望）与简短理由。
        - 展示期货的关键数据与涨跌幅（如可得），用于佐证结论。

        最新内容：
        ${content}
        `
    }
}