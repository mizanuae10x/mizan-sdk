import * as fs from 'fs';
import * as path from 'path';

export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  agentId: string;
  messages: MemoryMessage[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class SessionMemory {
  private sessions: Record<string, Session> = {};
  private storePath: string;
  private maxMessages: number;

  constructor(storePath?: string, maxMessages = 50) {
    this.storePath = storePath || path.join(process.cwd(), 'data', 'sessions.json');
    this.maxMessages = maxMessages;
    this.load();
  }

  getOrCreate(sessionId: string, agentId: string): Session {
    if (!this.sessions[sessionId]) {
      const now = new Date().toISOString();
      this.sessions[sessionId] = {
        id: sessionId,
        agentId,
        messages: [],
        metadata: {},
        createdAt: now,
        updatedAt: now
      };
    }
    return this.sessions[sessionId];
  }

  addMessage(sessionId: string, agentId: string, role: 'user' | 'assistant', content: string): void {
    const session = this.getOrCreate(sessionId, agentId);
    session.messages.push({ role, content, timestamp: new Date().toISOString() });
    if (session.messages.length > this.maxMessages) {
      session.messages = session.messages.slice(-this.maxMessages);
    }
    session.updatedAt = new Date().toISOString();
    this.save();
  }

  getHistory(sessionId: string): MemoryMessage[] {
    return this.sessions[sessionId]?.messages || [];
  }

  setMetadata(sessionId: string, key: string, value: unknown): void {
    if (this.sessions[sessionId]) {
      this.sessions[sessionId].metadata[key] = value;
      this.sessions[sessionId].updatedAt = new Date().toISOString();
      this.save();
    }
  }

  listSessions(agentId?: string): Array<Omit<Session, 'messages'> & { messageCount: number }> {
    return Object.values(this.sessions)
      .filter(session => !agentId || session.agentId === agentId)
      .map(({ messages, ...rest }) => ({ ...rest, messageCount: messages.length }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  clearSession(sessionId: string): void {
    delete this.sessions[sessionId];
    this.save();
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.sessions, null, 2));
  }

  private load(): void {
    if (!fs.existsSync(this.storePath)) return;
    try {
      this.sessions = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      this.sessions = {};
    }
  }
}
