const { SessionMemory } = require('../dist');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('SessionMemory', () => {
  let memory;
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-sessions-${Date.now()}.json`);
    memory = new SessionMemory(tmpFile);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('getOrCreate creates new session', () => {
    const session = memory.getOrCreate('sess-1', 'agent-1');
    expect(session.id).toBe('sess-1');
    expect(session.agentId).toBe('agent-1');
    expect(session.messages).toHaveLength(0);
  });

  test('getOrCreate returns existing session on second call', () => {
    memory.getOrCreate('sess-1', 'agent-1');
    memory.addMessage('sess-1', 'agent-1', 'user', 'Hello');
    const session = memory.getOrCreate('sess-1', 'agent-1');
    expect(session.messages).toHaveLength(1);
  });

  test('addMessage stores user and assistant messages', () => {
    memory.addMessage('sess-2', 'agent-1', 'user', 'What is PDPL?');
    memory.addMessage('sess-2', 'agent-1', 'assistant', 'Federal Decree-Law 45/2021...');
    const history = memory.getHistory('sess-2');
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  test('getHistory returns empty array for unknown session', () => {
    expect(memory.getHistory('non-existent')).toHaveLength(0);
  });

  test('listSessions filters by agentId', () => {
    memory.addMessage('s1', 'agent-A', 'user', 'Hello');
    memory.addMessage('s2', 'agent-B', 'user', 'Hi');
    const agentA = memory.listSessions('agent-A');
    expect(agentA).toHaveLength(1);
    expect(agentA[0].agentId).toBe('agent-A');
  });

  test('listSessions returns all when no filter', () => {
    memory.addMessage('s1', 'agent-A', 'user', 'msg1');
    memory.addMessage('s2', 'agent-B', 'user', 'msg2');
    expect(memory.listSessions()).toHaveLength(2);
  });

  test('clearSession removes the session', () => {
    memory.addMessage('sess-del', 'agent-1', 'user', 'test');
    memory.clearSession('sess-del');
    expect(memory.getHistory('sess-del')).toHaveLength(0);
    expect(memory.listSessions()).toHaveLength(0);
  });

  test('setMetadata stores key-value on session', () => {
    memory.getOrCreate('sess-meta', 'agent-1');
    memory.setMetadata('sess-meta', 'language', 'ar');
    const session = memory.getOrCreate('sess-meta', 'agent-1');
    expect(session.metadata.language).toBe('ar');
  });

  test('maxMessages truncates old messages', () => {
    const smallMemory = new SessionMemory(tmpFile + '-small', 3);
    for (let i = 0; i < 5; i++) {
      smallMemory.addMessage('sess', 'agent', 'user', `msg ${i}`);
    }
    const history = smallMemory.getHistory('sess');
    expect(history).toHaveLength(3);
    expect(history[history.length - 1].content).toBe('msg 4');
    try { fs.unlinkSync(tmpFile + '-small'); } catch {}
  });

  test('persists to disk and reloads', () => {
    memory.addMessage('persist-sess', 'agent-1', 'user', 'Persistent message');
    const memory2 = new SessionMemory(tmpFile);
    expect(memory2.getHistory('persist-sess')).toHaveLength(1);
    expect(memory2.getHistory('persist-sess')[0].content).toBe('Persistent message');
  });

  test('listSessions includes messageCount', () => {
    memory.addMessage('s1', 'agent-1', 'user', 'msg1');
    memory.addMessage('s1', 'agent-1', 'assistant', 'reply1');
    const list = memory.listSessions();
    expect(list[0].messageCount).toBe(2);
  });
});
