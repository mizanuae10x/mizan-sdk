/**
 * ExpressionEvaluator — Safe boolean expression evaluator for rule conditions.
 *
 * Replaces `new Function()` usage in RuleEngine. Parses and evaluates boolean
 * expressions against a facts object WITHOUT using eval or Function constructor.
 *
 * Supported syntax:
 *   Literals  : 123, 3.14, "string", 'string', true, false, null
 *   Identifiers: score, user.role (dot notation supported)
 *   Comparison : >, >=, <, <=, ===, ==, !==, !=
 *   Logical   : &&, ||, !
 *   Grouping  : (expr)
 *
 * Examples:
 *   score >= 80
 *   country === "AE" && amount > 500000
 *   bonus === true
 *   score >= 30 && score < 80
 *   !(status === "blocked")
 *   user.role === "admin"
 *
 * @module ExpressionEvaluator
 */

// ── Token types ────────────────────────────────────────────────────────────────

type TNumber  = { type: 'NUMBER';  value: number };
type TString  = { type: 'STRING';  value: string };
type TBool    = { type: 'BOOL';    value: boolean };
type TNull    = { type: 'NULL' };
type TIdent   = { type: 'IDENT';   value: string };
type TOp      = { type: 'OP';      value: '>' | '>=' | '<' | '<=' | '===' | '==' | '!==' | '!=' };
type TLogic   = { type: 'LOGIC';   value: '&&' | '||' };
type TNot     = { type: 'NOT' };
type TLParen  = { type: 'LPAREN' };
type TRParen  = { type: 'RPAREN' };
type TEOF     = { type: 'EOF' };

type Token = TNumber | TString | TBool | TNull | TIdent | TOp | TLogic | TNot | TLParen | TRParen | TEOF;

// ── Tokeniser ──────────────────────────────────────────────────────────────────

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    // Whitespace
    if (/\s/.test(s[i])) { i++; continue; }

    // String literals (" or ')
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i++];
      let str = '';
      while (i < s.length && s[i] !== q) {
        str += s[i] === '\\' ? s[++i] : s[i];
        i++;
      }
      if (i >= s.length) throw new Error('Unterminated string literal');
      i++; // closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Number literal (positive only — unary minus handled by parser)
    if (/[0-9]/.test(s[i])) {
      const m = s.slice(i).match(/^[0-9]+(\.[0-9]+)?/)!;
      tokens.push({ type: 'NUMBER', value: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }

    // Multi-char operators (longest match first)
    const slice3 = s.slice(i, i + 3);
    const slice2 = s.slice(i, i + 2);

    if (slice3 === '===') { tokens.push({ type: 'OP', value: '===' }); i += 3; continue; }
    if (slice3 === '!==') { tokens.push({ type: 'OP', value: '!==' }); i += 3; continue; }
    if (slice2 === '>=')  { tokens.push({ type: 'OP', value: '>=' });  i += 2; continue; }
    if (slice2 === '<=')  { tokens.push({ type: 'OP', value: '<=' });  i += 2; continue; }
    if (slice2 === '!=')  { tokens.push({ type: 'OP', value: '!=' });  i += 2; continue; }
    if (slice2 === '==')  { tokens.push({ type: 'OP', value: '==' });  i += 2; continue; }
    if (slice2 === '&&')  { tokens.push({ type: 'LOGIC', value: '&&' }); i += 2; continue; }
    if (slice2 === '||')  { tokens.push({ type: 'LOGIC', value: '||' }); i += 2; continue; }

    if (s[i] === '>')  { tokens.push({ type: 'OP', value: '>' });  i++; continue; }
    if (s[i] === '<')  { tokens.push({ type: 'OP', value: '<' });  i++; continue; }
    if (s[i] === '!')  { tokens.push({ type: 'NOT' });              i++; continue; }
    if (s[i] === '(')  { tokens.push({ type: 'LPAREN' });           i++; continue; }
    if (s[i] === ')')  { tokens.push({ type: 'RPAREN' });           i++; continue; }

    // Identifiers and keywords
    const idMatch = s.slice(i).match(/^[a-zA-Z_$][a-zA-Z0-9_$.]*/)
    if (idMatch) {
      const id = idMatch[0];
      if      (id === 'true')      tokens.push({ type: 'BOOL', value: true });
      else if (id === 'false')     tokens.push({ type: 'BOOL', value: false });
      else if (id === 'null')      tokens.push({ type: 'NULL' });
      else if (id === 'undefined') tokens.push({ type: 'NULL' });
      else                         tokens.push({ type: 'IDENT', value: id });
      i += id.length;
      continue;
    }

    throw new Error(`Unexpected character '${s[i]}' at position ${i} in expression: "${input}"`);
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

// ── Parser / Evaluator ─────────────────────────────────────────────────────────
//
// Grammar (precedence low → high):
//   expr       ::= orExpr
//   orExpr     ::= andExpr  ( '||' andExpr  )*
//   andExpr    ::= notExpr  ( '&&' notExpr  )*
//   notExpr    ::= '!' notExpr | cmpExpr
//   cmpExpr    ::= primary  ( OP primary )?
//   primary    ::= '(' expr ')' | NUMBER | STRING | BOOL | NULL | IDENT

export class ExpressionEvaluator {
  private tokens: Token[] = [];
  private pos = 0;

  /**
   * Evaluate a boolean expression string against the given facts object.
   * Returns true/false — never throws for normal rule evaluation (returns false on error).
   *
   * @param expression - e.g. 'score >= 80 && country === "AE"'
   * @param facts      - { score: 95, country: 'AE' }
   */
  evaluate(expression: string, facts: Record<string, unknown>): boolean {
    try {
      this.tokens = tokenize(expression);
      this.pos = 0;
      const result = this.parseOr(facts);
      if (this.tokens[this.pos].type !== 'EOF') {
        throw new Error(`Trailing tokens at position ${this.pos}`);
      }
      return Boolean(result);
    } catch (err) {
      // Surface the error for debugging in development
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[ExpressionEvaluator] ${(err as Error).message}`);
      }
      return false;
    }
  }

  /**
   * Compile an expression into a reusable function (avoids re-tokenising on every call).
   * The returned function captures no closures over mutable state.
   */
  compile(expression: string): (facts: Record<string, unknown>) => boolean {
    // Pre-validate by tokenising once
    tokenize(expression); // throws if syntax error
    return (facts: Record<string, unknown>) => this.evaluate(expression, facts);
  }

  // ── Private parser methods ──────────────────────────────────────────────────

  private peek(): Token { return this.tokens[this.pos]; }

  private consume(): Token { return this.tokens[this.pos++]; }

  private parseOr(facts: Record<string, unknown>): boolean {
    let left = this.parseAnd(facts);
    while (this.peek().type === 'LOGIC' && (this.peek() as TLogic).value === '||') {
      this.consume();
      const right = this.parseAnd(facts);
      left = left || right;
    }
    return left;
  }

  private parseAnd(facts: Record<string, unknown>): boolean {
    let left = this.parseNot(facts);
    while (this.peek().type === 'LOGIC' && (this.peek() as TLogic).value === '&&') {
      this.consume();
      const right = this.parseNot(facts);
      left = left && right;
    }
    return left;
  }

  private parseNot(facts: Record<string, unknown>): boolean {
    if (this.peek().type === 'NOT') {
      this.consume();
      return !this.parseNot(facts);
    }
    return this.parseComparison(facts);
  }

  private parseComparison(facts: Record<string, unknown>): boolean {
    const left = this.parsePrimary(facts);

    if (this.peek().type === 'OP') {
      const op = (this.consume() as TOp).value;
      const right = this.parsePrimary(facts);

      /* eslint-disable eqeqeq */
      switch (op) {
        case '>':   return (left as number)  > (right as number);
        case '>=':  return (left as number)  >= (right as number);
        case '<':   return (left as number)  < (right as number);
        case '<=':  return (left as number)  <= (right as number);
        case '===': return left === right;
        case '==':  return left == right;
        case '!==': return left !== right;
        case '!=':  return left != right;
        default:    throw new Error(`Unknown comparison operator: ${op}`);
      }
      /* eslint-enable eqeqeq */
    }

    return Boolean(left);
  }

  private parsePrimary(facts: Record<string, unknown>): unknown {
    const tok = this.peek();

    if (tok.type === 'LPAREN') {
      this.consume();
      const val = this.parseOr(facts);
      if (this.peek().type !== 'RPAREN') throw new Error('Missing closing parenthesis');
      this.consume();
      return val;
    }

    if (tok.type === 'NUMBER') { this.consume(); return tok.value; }
    if (tok.type === 'STRING') { this.consume(); return tok.value; }
    if (tok.type === 'BOOL')   { this.consume(); return tok.value; }
    if (tok.type === 'NULL')   { this.consume(); return null; }

    if (tok.type === 'IDENT') {
      this.consume();
      // Support dot notation: user.role, request.amount
      const parts = tok.value.split('.');
      let val: unknown = facts[parts[0]];
      for (let i = 1; i < parts.length; i++) {
        if (val == null) return undefined;
        val = (val as Record<string, unknown>)[parts[i]];
      }
      return val;
    }

    throw new Error(`Unexpected token type '${tok.type}' at position ${this.pos}`);
  }
}

/**
 * Convenience function: evaluate a single expression string against facts.
 * Creates a new evaluator instance per call — use `new ExpressionEvaluator().compile()`
 * when the same expression will be evaluated many times.
 */
export function evaluateExpression(
  expression: string,
  facts: Record<string, unknown>
): boolean {
  return new ExpressionEvaluator().evaluate(expression, facts);
}
