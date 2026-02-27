export { OpenAIAdapter } from './OpenAIAdapter';
export { AnthropicAdapter } from './AnthropicAdapter';
export { MockAdapter } from './MockAdapter';

import { LLMAdapter } from '../types';
import { OpenAIAdapter } from './OpenAIAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { MockAdapter } from './MockAdapter';

export function autoDetectAdapter(): LLMAdapter {
  if (process.env.OPENAI_API_KEY) return new OpenAIAdapter();
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicAdapter();
  return new MockAdapter();
}
