import { Rule, Decision, Conflict } from './types';
import { ExpressionEvaluator } from './ExpressionEvaluator';
import * as crypto from 'crypto';

type CompiledRule = {
  rule: Rule;
  test: (facts: Record<string, unknown>) => boolean;
};

const _evaluator = new ExpressionEvaluator();

/**
 * Compile a condition string into a safe, reusable test function.
 * Uses ExpressionEvaluator — no `new Function()` or `eval()`.
 *
 * Supported syntax: comparison operators (>, >=, <, <=, ===, ==, !==, !=),
 * logical operators (&&, ||, !), parentheses, string/number/boolean literals,
 * and dot-notation identifiers for nested fact access.
 */
function compileCondition(condition: string): (facts: Record<string, unknown>) => boolean {
  // Pre-validate at load time — throws early on syntax errors
  return _evaluator.compile(condition);
}

export class RuleEngine {
  private compiled: CompiledRule[] = [];

  /**
   * Load and compile a set of rules. Rules are sorted by priority (ascending).
   * Throws on invalid condition syntax — fail fast at load time, not eval time.
   */
  loadRules(rules: Rule[]): void {
    this.compiled = rules
      .sort((a, b) => a.priority - b.priority)
      .map(rule => ({
        rule,
        test: compileCondition(rule.condition),
      }));
  }

  /**
   * Append a single rule to the engine and re-sort by priority.
   */
  addRule(rule: Rule): void {
    this.compiled.push({ rule, test: compileCondition(rule.condition) });
    this.compiled.sort((a, b) => a.rule.priority - b.rule.priority);
  }

  /**
   * Return the raw rule definitions.
   */
  getRules(): Rule[] {
    return this.compiled.map(c => c.rule);
  }

  /**
   * Evaluate facts against the loaded rules. Returns the first matching rule's
   * Decision, or a REVIEW decision if no rule matches.
   *
   * Score semantics:
   *   APPROVED → rule.score ?? 85
   *   REJECTED → rule.score ?? 15
   *   REVIEW   → rule.score ?? 50
   */
  evaluate(facts: Record<string, unknown>): Decision {
    const auditId = crypto.randomUUID();

    for (const { rule, test } of this.compiled) {
      try {
        if (test(facts)) {
          const defaultScore =
            rule.action === 'APPROVED' ? 85 :
            rule.action === 'REJECTED' ? 15 : 50;

          return {
            result: rule.action,
            matchedRule: rule,
            reason: rule.reason,
            score: rule.score ?? defaultScore,
            auditId,
          };
        }
      } catch {
        // Skip rules whose conditions throw at runtime (e.g. type mismatch)
      }
    }

    return {
      result: 'REVIEW',
      matchedRule: null,
      reason: 'No matching rule found — manual review required',
      score: 50,
      auditId,
    };
  }

  /**
   * Detect conflicting rules: same condition, different actions.
   */
  detectConflicts(): Conflict[] {
    const conflicts: Conflict[] = [];
    const rules = this.compiled.map(c => c.rule);

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i];
        const b = rules[j];
        if (a.condition === b.condition && a.action !== b.action) {
          conflicts.push({
            ruleA: a,
            ruleB: b,
            description: `Rules "${a.name}" and "${b.name}" have the same condition but different actions`,
          });
        }
      }
    }

    return conflicts;
  }
}
