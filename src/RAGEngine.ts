import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface RagDocument {
  id: string;
  name: string;
  content: string;
  chunks: RagChunk[];
  createdAt: string;
}

export interface RagChunk {
  id: string;
  docId: string;
  docName: string;
  text: string;
  embedding: number[];
  index: number;
}

export interface RagSearchResult {
  chunk: RagChunk;
  score: number; // cosine similarity 0-1
}

export interface RagAnswer {
  answer: string;
  sources: RagSearchResult[];
  query: string;
}

export class RAGEngine {
  private chunks: RagChunk[] = [];
  private documents: RagDocument[] = [];
  private storePath: string;
  private apiKey: string;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(process.cwd(), 'data', 'rag-store.json');
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.load();
  }

  // Split text into overlapping chunks
  chunk(text: string, chunkSize = 500, overlap = 50): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let i = 0;
    while (i < words.length) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
      i += chunkSize - overlap;
    }
    return chunks.filter(c => c.trim().length > 20);
  }

  // Get embedding from OpenAI
  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      // Fallback: simple hash-based pseudo-embedding (for testing without API key)
      return this.hashEmbed(text);
    }
    const https = await import('https');
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ input: text.slice(0, 8000), model: 'text-embedding-ada-002' });
      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/embeddings',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        res => {
          let data = '';
          res.on('data', d => (data += d));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.data && json.data[0]) resolve(json.data[0].embedding);
              else reject(new Error(json.error?.message || 'Embedding failed'));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // Hash-based pseudo-embedding for offline use (128 dims)
  private hashEmbed(text: string): number[] {
    const vec = new Array(128).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      const h = crypto.createHash('md5').update(word).digest();
      for (let i = 0; i < 16; i++) {
        vec[i * 8 + (h[i] % 8)] += 1;
      }
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }

  // Cosine similarity
  cosineSim(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  // Ingest a document
  async ingest(name: string, content: string): Promise<RagDocument> {
    const docId = 'doc-' + crypto.randomBytes(4).toString('hex');
    const textChunks = this.chunk(content);
    const chunks: RagChunk[] = [];
    for (let i = 0; i < textChunks.length; i++) {
      const embedding = await this.embed(textChunks[i]);
      chunks.push({ id: `${docId}-c${i}`, docId, docName: name, text: textChunks[i], embedding, index: i });
    }
    const doc: RagDocument = { id: docId, name, content, chunks, createdAt: new Date().toISOString() };
    this.documents.push(doc);
    this.chunks.push(...chunks);
    this.save();
    return doc;
  }

  // Semantic search
  async search(query: string, topK = 3): Promise<RagSearchResult[]> {
    if (this.chunks.length === 0) return [];
    const qEmbed = await this.embed(query);
    return this.chunks
      .map(chunk => ({ chunk, score: this.cosineSim(qEmbed, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // RAG answer using OpenAI
  async answer(query: string, topK = 3): Promise<RagAnswer> {
    const sources = await this.search(query, topK);
    if (sources.length === 0) {
      return { answer: 'No documents in knowledge base yet. Please upload documents first.', sources: [], query };
    }
    const context = sources.map((s, i) => `[${i + 1}] ${s.chunk.docName}:\n${s.chunk.text}`).join('\n\n');
    const prompt = `You are a helpful assistant. Answer the question using ONLY the provided context. Always cite sources as [1], [2], etc.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;
    if (!this.apiKey) {
      return {
        answer: `Based on the documents, here are the most relevant sections:\n\n${sources
          .map((s, i) => `[${i + 1}] ${s.chunk.text.slice(0, 200)}...`)
          .join('\n\n')}`,
        sources,
        query
      };
    }
    const https = await import('https');
    const answerText = await new Promise<string>((resolve, reject) => {
      const body = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      });
      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        res => {
          let data = '';
          res.on('data', d => (data += d));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              resolve(j.choices?.[0]?.message?.content || 'No answer');
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { answer: answerText, sources, query };
  }

  // List all documents
  listDocuments(): Omit<RagDocument, 'chunks' | 'content'>[] {
    return this.documents.map(d => ({
      id: d.id,
      name: d.name,
      createdAt: d.createdAt,
      chunkCount: d.chunks.length
    })) as Omit<RagDocument, 'chunks' | 'content'>[];
  }

  // Delete document
  deleteDocument(docId: string): boolean {
    const idx = this.documents.findIndex(d => d.id === docId);
    if (idx === -1) return false;
    this.documents.splice(idx, 1);
    this.chunks = this.chunks.filter(c => c.docId !== docId);
    this.save();
    return true;
  }

  // Stats
  getStats() {
    return {
      documentCount: this.documents.length,
      chunkCount: this.chunks.length,
      hasEmbeddings: this.chunks.some(c => c.embedding.length > 0)
    };
  }

  private save() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify({ documents: this.documents, chunks: this.chunks }, null, 2));
  }

  private load() {
    if (fs.existsSync(this.storePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
        this.documents = data.documents || [];
        this.chunks = data.chunks || [];
      } catch {
        // ignore load errors
      }
    }
  }
}
