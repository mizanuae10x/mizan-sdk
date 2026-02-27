import { LLMAdapter } from '../types';

export class MockAdapter implements LLMAdapter {
  private responses: Map<string, string> = new Map();
  private defaultResponse: string;

  constructor(defaultResponse: string = '{"result": "mock response"}') {
    this.defaultResponse = defaultResponse;
  }

  setResponse(promptContains: string, response: string): void {
    this.responses.set(promptContains, response);
  }

  async complete(prompt: string): Promise<string> {
    for (const [key, value] of this.responses) {
      if (prompt.includes(key)) return value;
    }
    return this.defaultResponse;
  }
}
