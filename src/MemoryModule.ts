import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: string;
  tags: string[];
}

export class MemoryModule {
  private entries: MemoryEntry[] = [];
  private filePath: string;
  private maxEntries: number;

  constructor(options?: { path?: string; maxEntries?: number }) {
    this.filePath = options?.path || config.memoryPath;
    this.maxEntries = options?.maxEntries || 10000;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        this.entries = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  store(content: string, metadata?: Record<string, unknown>, tags?: string[]): MemoryEntry {
    const entry: MemoryEntry = {
      id: this.generateId(),
      content,
      metadata: metadata || {},
      timestamp: new Date().toISOString(),
      tags: tags || [],
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    this.save();
    return entry;
  }

  search(query: string, limit: number = 10): MemoryEntry[] {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/);
    const scored = this.entries
      .map(e => {
        const text = (e.content + ' ' + e.tags.join(' ')).toLowerCase();
        const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
        return { entry: e, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(x => x.entry);
  }

  getRecent(limit: number = 10): MemoryEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  forget(id: string): void {
    this.entries = this.entries.filter(e => e.id !== id);
    this.save();
  }

  clear(): void {
    this.entries = [];
    this.save();
  }

  getStats(): { total: number; oldest: string; newest: string } {
    return {
      total: this.entries.length,
      oldest: this.entries[0]?.timestamp || '',
      newest: this.entries[this.entries.length - 1]?.timestamp || '',
    };
  }
}
