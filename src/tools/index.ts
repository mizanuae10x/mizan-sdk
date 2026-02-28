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

// ── Safe Math Evaluator ────────────────────────────────────────────────────────
// Recursive-descent parser for arithmetic expressions.
// Supports: +, -, *, /, ^(power), unary minus/plus, parentheses, decimals.
// No eval(), no Function() — pure string parsing.

function safeMath(expr: string): number {
  let pos = 0;
  const s = expr.replace(/\s+/g, '');

  function parseExpr(): number { return parseAddSub(); }

  function parseAddSub(): number {
    let v = parseMulDiv();
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++];
      const r = parseMulDiv();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  function parseMulDiv(): number {
    let v = parsePow();
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++];
      const r = parsePow();
      if (op === '/' && r === 0) throw new Error('Division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }

  function parsePow(): number {
    let base = parseUnary();
    if (pos < s.length && s[pos] === '^') {
      pos++;
      const exp = parseUnary(); // right-associative
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (s[pos] === '-') { pos++; return -parsePrimary(); }
    if (s[pos] === '+') { pos++; return parsePrimary(); }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (s[pos] === '(') {
      pos++; // consume '('
      const v = parseExpr();
      if (s[pos] !== ')') throw new Error(`Missing closing parenthesis at position ${pos}`);
      pos++; // consume ')'
      return v;
    }
    const m = s.slice(pos).match(/^[0-9]+(\.[0-9]+)?/);
    if (!m) throw new Error(`Unexpected character '${s[pos]}' at position ${pos} in: "${expr}"`);
    pos += m[0].length;
    return parseFloat(m[0]);
  }

  const result = parseExpr();
  if (pos !== s.length) {
    throw new Error(`Unexpected character '${s[pos]}' at position ${pos} in: "${expr}"`);
  }
  return result;
}

export const calculatorTool: Tool = {
  name: 'calculate',
  description: 'Evaluate mathematical expressions safely (no eval/Function used)',
  input: { expression: 'Math expression — supports +, -, *, /, ^, parentheses, decimals' },
  handler: async ({ expression }) => {
    const sanitized = String(expression)
      .replace(/[^0-9+\-*/().^ ]/g, '') // strip anything not math
      .trim();
    if (!sanitized) return { result: null, error: 'Empty expression' };
    try {
      const result = safeMath(sanitized);
      return { result, expression: sanitized };
    } catch (err) {
      return { result: null, error: (err as Error).message, expression: sanitized };
    }
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
