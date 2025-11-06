export class GenerateError extends Error{
    constructor(message: string) {
        super(message);
        this.name = "GenerateError";
    }
}

export class NewsServiceError extends Error{
    constructor(message: string) {
        super(message);
        this.name = "NewsServiceError";
    }
}

export class LLMError extends Error{
    constructor(message: string) {
        super(message);
        this.name = "LLMError";
    }
}
