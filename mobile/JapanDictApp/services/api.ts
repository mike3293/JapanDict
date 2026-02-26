import { Platform } from 'react-native';
import SSE from 'react-native-sse';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSessionInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface KanjiEntry {
  id: string;
  character: string;
  readings: string[];
  meanings: string[];
  jlptLevel?: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...(init?.headers as Record<string, string> | undefined) },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }


  async getSessions(): Promise<ChatSessionInfo[]> {
    return this.request<ChatSessionInfo[]>('/api/chat/sessions');
  }

  async createSession(): Promise<ChatSession> {
    return this.request<ChatSession>('/api/chat/sessions', { method: 'POST' });
  }

  async getSession(id: string): Promise<ChatSession> {
    return this.request<ChatSession>(`/api/chat/sessions/${id}`);
  }

  /**
   * Send a message and stream the AI response.
   * Calls `onToken` for each streamed token, then calls `onDone` when complete.
   */
  async sendMessageStream(
    sessionId: string,
    content: string,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    // React Native's fetch does not expose a readable stream, so we use
    // an SSE client on mobile. On web we can fall back to the original
    // streaming implementation for better performance.
    if (Platform.OS !== 'web') {
      // use react-native-sse
      return new Promise<void>((resolve, reject) => {
        const es = new SSE(
          `${this.baseUrl}/api/chat/sessions/${sessionId}/messages`,
          {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ content }),
          },
        );

        es.addEventListener('message', (e) => {
          if (e.data === '[DONE]') {
            onDone();
            es.close();
            resolve();
            return;
          }
          try {
            const { token } = e.data && JSON.parse(e.data);
            if (token) onToken(token);
          } catch {
            // ignore
          }
        });

        es.addEventListener('error', (e: any) => {
          const err = new Error(String(e));
          onError(err);
          es.close();
          reject(err);
        });

        // abort handling
        signal?.addEventListener('abort', () => {
          es.close();
          const err = new Error('aborted');
          onError(err);
          reject(err);
        });
      });
    }

    // web / other environments with streaming support
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ content }),
        signal,
      });
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      onError(new Error(`API error ${response.status}: ${text}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines: split by double newline
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          if (!event.trim()) continue;
          const dataLine = event.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const data = dataLine.slice(6);
          if (data === '[DONE]') {
            onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data) as { token: string };
            if (parsed.token) onToken(parsed.token);
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onError(err);
      }
    } finally {
      reader.releaseLock();
      onDone();
    }
  }

  async getKanji(): Promise<KanjiEntry[]> {
    return this.request<KanjiEntry[]>('/api/kanji');
  }

  async searchKanji(q: string): Promise<KanjiEntry[]> {
    return this.request<KanjiEntry[]>(`/api/kanji/search?q=${encodeURIComponent(q)}`);
  }
}
