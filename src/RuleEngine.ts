import { Rule, Decision, Conflict } from './types';
import * as crypto from 'crypto';

type CompiledRule = {
  rule: Rule;
  test: (facts: Record<string, unknown>) => boolean;
};

function compileCondition(condition: string): (facts: Record<string, unknown>) => boolean {
  return (facts: Record<string, unknown>): boolean => {
    const keys = Object.keys(facts);
    const values = keys.map(k => facts[k]);
    try {
      const fn = new Function(...keys, `return !!(${condition});`);
      return fn(...values);
    } catch {
      return false;
    }
  };
}

export class RuleEngine {
  private compiled: CompiledRule[] = [];

  loadRules(rules: Rule[]): void {
    this.compiled = rules
      .sort((a, b) => a.priority - b.priority)
      .map(rule => ({
        rule,
        test: compileCondition(rule.condition),
      }));
  }

  addRule(rule: Rule): void {
    this.compiled.push({ rule, test: compileCondition(rule.condition) });
    this.compiled.sort((a, b) => a.rule.priority - b.rule.priority);
  }

  getRules(): Rule[] {
    return this.compiled.map(c => c.rule);
  }

  evaluate(facts: Record<string, unknown>): Decision {
    const auditId = crypto.randomUUID();

    for (const { rule, test } of this.compiled) {
      try {
        if (test(facts)) {
          return {
            result: rule.action,
            matchedRule: rule,
            reason: rule.reason,
            score: rule.action === 'APPROVED' ? 85 : rule.action === 'REJECTED' ? 15 : 50,
            auditId,
          };
        }
      } catch {
        // skip failing rules
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
