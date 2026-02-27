import { Tool } from '../ToolRegistry';

export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the web for current information',
  input: { query: 'Search query string' },
  handler: async ({ query }) => {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(String(query))}&format=json&no_html=1`
    );
    const data = await res.json() as any;
    return {
      answer: data.AbstractText || data.RelatedTopics?.[0]?.Text || 'No results',
      source: data.AbstractURL,
    };
  },
};

export const calculatorTool: Tool = {
  name: 'calculate',
  description: 'Evaluate mathematical expressions safely',
  input: { expression: 'Math expression to evaluate' },
  handler: async ({ expression }) => {
    const sanitized = String(expression).replace(/[^0-9+\-*/()., ]/g, '');
    const result = new Function('return (' + sanitized + ')')();
    return { result, expression: sanitized };
  },
};

export const dateTimeTool: Tool = {
  name: 'get_datetime',
  description: 'Get current date and time',
  input: { timezone: 'Timezone like Asia/Dubai (optional)' },
  handler: async ({ timezone }) => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString('ar-AE', { timeZone: (timezone as string) || 'Asia/Dubai' }),
      timestamp: now.getTime(),
    };
  },
};

export const httpTool: Tool = {
  name: 'http_request',
  description: 'Make HTTP GET/POST requests to external APIs',
  input: { url: 'URL', method: 'GET or POST', body: 'JSON body for POST (optional)' },
  handler: async ({ url, method, body }) => {
    const res = await fetch(url as string, {
      method: (method as string) || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  },
};

export const fileReaderTool: Tool = {
  name: 'read_file',
  description: 'Read content from a local file',
  input: { path: 'File path to read' },
  handler: async ({ path }) => {
    const fs = require('fs');
    const content = fs.readFileSync(path as string, 'utf8');
    return { content, length: content.length };
  },
};
