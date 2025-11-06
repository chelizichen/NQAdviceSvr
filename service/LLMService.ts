import { OpenAI } from "openai";
import { fetch as undiciFetch, Headers as UndiciHeaders, Request as UndiciRequest, Response as UndiciResponse, FormData as UndiciFormData, File as UndiciFile } from "undici";
import type { ChatCompletionMessageParam } from "openai/resources";
import { LLMError } from "./errors";

export class OpenAIClient{
  public openai: OpenAI;
  constructor() {
    // Node <18 lacks web fetch APIs; polyfill for OpenAI SDK
    if (!(globalThis as any).fetch) {
      (globalThis as any).fetch = undiciFetch as any;
    }
    if (!(globalThis as any).Headers) {
      (globalThis as any).Headers = UndiciHeaders as any;
    }
    if (!(globalThis as any).Request) {
      (globalThis as any).Request = UndiciRequest as any;
    }
    if (!(globalThis as any).Response) {
      (globalThis as any).Response = UndiciResponse as any;
    }
    if (!(globalThis as any).FormData) {
      (globalThis as any).FormData = UndiciFormData as any;
    }
    if (!(globalThis as any).File) {
      (globalThis as any).File = UndiciFile as any;
    }
    this.openai = new OpenAI({
      baseURL: process.env.OPENAI_URL,
      apiKey: process.env.OPENAI_API_KEY,
      fetch: undiciFetch as any,
    });
  }
  async generateWithList(promptList: Array<ChatCompletionMessageParam>) {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: promptList,
        model: "deepseek-reasoner",
        stream: true,
      });
      return completion
    } catch (error) {
      throw new LLMError(`generateWithList error ${error}`)
    }
    // let text = '';
    // for await (const part of completion) {
    //   const delta = part.choices[0].delta.content ?? '';
    //   text += delta;
    //   process.stdout.write(delta);
    // }
    // return text;
  }
}