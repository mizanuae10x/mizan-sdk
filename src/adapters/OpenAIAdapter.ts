import { LLMAdapter } from '../types';

export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'gpt-4') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model;
    if (!this.apiKey) throw new Error('OPENAI_API_KEY not set');
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = await res.json() as any;
    return data.choices[0].message.content;
  }
}
