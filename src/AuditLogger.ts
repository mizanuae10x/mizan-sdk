import { AuditEntry, Decision, Rule } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private previousHash: string = '0'.repeat(64);
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(process.cwd(), 'data', 'audit.jsonl');
  }

  private computeHash(previousHash: string, entry: Omit<AuditEntry, 'hash'>): string {
    const data = previousHash + JSON.stringify(entry);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  log(decision: Decision, input: Record<string, unknown> = {}): AuditEntry {
    const partial = {
      id: decision.auditId || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      input,
      output: decision,
      rule: decision.matchedRule,
      previousHash: this.previousHash,
    };

    const hash = this.computeHash(this.previousHash, partial as any);
    const entry: AuditEntry = { ...partial, hash };

    this.entries.push(entry);
    this.previousHash = hash;

    // Append to file
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
    } catch {
      // silent — in-memory still works
    }

    return entry;
  }

  query(filter?: { startDate?: string; endDate?: string; result?: string }): AuditEntry[] {
    if (!filter) return [...this.entries];

    return this.entries.filter(e => {
      if (filter.startDate && e.timestamp < filter.startDate) return false;
      if (filter.endDate && e.timestamp > filter.endDate) return false;
      if (filter.result && e.output.result !== filter.result) return false;
      return true;
    });
  }

  exportCSV(): string {
    const header = 'id,timestamp,result,rule,reason,score,hash';
    const rows = this.entries.map(e =>
      [e.id, e.timestamp, e.output.result, e.rule?.name || 'N/A', `"${e.output.reason}"`, e.output.score, e.hash].join(',')
    );
    return [header, ...rows].join('\n');
  }

  getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  verify(): boolean {
    let prevHash = '0'.repeat(64);
    for (const entry of this.entries) {
      const { hash, ...rest } = entry;
      const expected = this.computeHash(prevHash, rest as any);
      if (expected !== hash) return false;
      prevHash = hash;
    }
    return true;
  }
}
