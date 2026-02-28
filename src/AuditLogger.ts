import { AuditEntry, Decision, Rule } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private previousHash: string = '0'.repeat(64);
  private filePath: string;

  /**
   * @param filePath - Path to the audit JSONL file. Defaults to `data/audit.jsonl`.
   * @param preload  - If true, loads all existing entries from disk into memory on startup.
   *                   Enables in-memory query after restart. Default: false (chain-only restore).
   */
  constructor(filePath?: string, preload = false) {
    this.filePath = filePath || path.join(process.cwd(), 'data', 'audit.jsonl');
    if (preload) {
      this.loadFromDisk();
    } else {
      this.restoreChainFromDisk();
    }
  }

  // Restore previousHash from the last line of the audit file on startup
  private restoreChainFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const content = fs.readFileSync(this.filePath, 'utf8').trim();
      if (!content) return;
      const lines = content.split('\n').filter(l => l.trim());
      const lastLine = lines[lines.length - 1];
      const lastEntry: AuditEntry = JSON.parse(lastLine);
      if (lastEntry?.hash) {
        this.previousHash = lastEntry.hash;
      }
    } catch {
      // If file is corrupt, start fresh
    }
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

  /**
   * Verify hash-chain integrity of in-memory entries.
   * Starts from the previousHash of the first entry (which may be the genesis
   * hash '0x0...' on first run, or a continuation hash after a restart).
   */
  verify(): boolean {
    if (this.entries.length === 0) return true;
    let prevHash = this.entries[0].previousHash;
    for (const entry of this.entries) {
      if (entry.previousHash !== prevHash) return false;
      const { hash, ...rest } = entry;
      const expected = this.computeHash(prevHash, rest as any);
      if (expected !== hash) return false;
      prevHash = hash;
    }
    return true;
  }

  /**
   * Full audit verification including genesis hash.
   * Loads ALL entries from disk and verifies from genesis '000...'.
   * Use for compliance auditing — slower but complete.
   */
  verifyFull(): boolean {
    try {
      if (!fs.existsSync(this.filePath)) return this.entries.length === 0;
      const content = fs.readFileSync(this.filePath, 'utf8').trim();
      if (!content) return this.entries.length === 0;
      const lines = content.split('\n').filter(l => l.trim());
      const allEntries: AuditEntry[] = lines.map(l => JSON.parse(l));
      let prevHash = '0'.repeat(64);
      for (const entry of allEntries) {
        const { hash, ...rest } = entry;
        const expected = this.computeHash(prevHash, rest as any);
        if (expected !== hash) return false;
        prevHash = hash;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load all entries from disk into this.entries.
   * Useful after a restart to make `query()` return the full history.
   * Also restores the hash chain pointer from the last entry.
   */
  loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const content = fs.readFileSync(this.filePath, 'utf8').trim();
      if (!content) return;
      const lines = content.split('\n').filter(l => l.trim());
      this.entries = lines.map(l => JSON.parse(l) as AuditEntry);
      if (this.entries.length > 0) {
        this.previousHash = this.entries[this.entries.length - 1].hash;
      }
    } catch {
      // Corrupt file — reset to empty, chain starts fresh
      this.entries = [];
    }
  }

  /**
   * Query entries from disk directly (bypasses in-memory state).
   * Safe to call after a restart even if `loadFromDisk()` was not used.
   * Returns all entries from the JSONL file matching the optional filter.
   */
  queryFromDisk(filter?: { startDate?: string; endDate?: string; result?: string }): AuditEntry[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const content = fs.readFileSync(this.filePath, 'utf8').trim();
      if (!content) return [];
      const entries: AuditEntry[] = content
        .split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l) as AuditEntry);

      if (!filter) return entries;
      return entries.filter(e => {
        if (filter.startDate && e.timestamp < filter.startDate) return false;
        if (filter.endDate   && e.timestamp > filter.endDate)   return false;
        if (filter.result    && e.output.result !== filter.result) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  /**
   * Number of entries currently in memory.
   * After a restart (without preload), this is the count since the process started.
   * Use `queryFromDisk().length` for total historical count.
   */
  size(): number {
    return this.entries.length;
  }
}
