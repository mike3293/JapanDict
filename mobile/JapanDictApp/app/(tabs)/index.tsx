import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  useColorScheme,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShareIntentContext } from 'expo-share-intent';

import { Colors } from '@/constants/theme';
import { useSettingsContext } from '@/contexts/settings-context';
import type { ChatMessage } from '@/services/api';

const SESSION_KEY = 'japandict_current_session';

interface Message extends ChatMessage {
  localId: string;
  isStreaming?: boolean;
}

function TypingIndicator({ isUser, colors }: { isUser: boolean; colors: typeof Colors.light }) {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!isUser) {
      const interval = setInterval(() => {
        setDots((prev) => (prev === 3 ? 1 : prev + 1));
      }, 400);
      return () => clearInterval(interval);
    }
  }, [isUser]);

  return (
    <Text style={{ color: isUser ? 'rgba(255,255,255,0.7)' : colors.icon }}>
      {' '}
      {'●'.repeat(dots)}
    </Text>
  );
}

function ChatBubble({ message, colors }: { message: Message; colors: typeof Colors.light }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: colors.tint }]
            : [styles.bubbleAssistant, { backgroundColor: colors.icon + '22' }],
        ]}>
        {!message.isStreaming ? (
          <Markdown
            style={{
              heading1: { fontSize: 24 },
              heading2: { fontSize: 18 },
              body: { color: colors.text },
              link: { color: colors.tint },
            }}
          >
            {message.content}
          </Markdown>
        ) : (
          <Text style={{ color: textColor }}>
            {message.content}
            <TypingIndicator isUser={isUser} colors={colors} />
          </Text>
        )}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ sessionId?: string; prompt?: string }>();
  const { apiClient, isLoaded } = useSettingsContext();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  // Show a simple alert when the app receives a PROCESS_TEXT intent
  useEffect(() => {
    if (!hasShareIntent || !shareIntent?.text) return;
    const action = shareIntent.action ?? '';
    const isProcessText = action.includes('PROCESS_TEXT') || action === 'android.intent.action.PROCESS_TEXT';
    if (isProcessText) {
      Alert.alert('Shared text', shareIntent.text, [
        { text: 'OK', onPress: () => resetShareIntent() },
      ]);
    }
  }, [hasShareIntent, shareIntent]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<AbortController | null>(null);
  const msgCountRef = useRef(0);
  const isSendingRef = useRef(false);

  // ── Configure header ─────────────────────────────────────────────────────
  useLayoutEffect(() => {
    navigation.setOptions({
      title: sessionTitle || 'JapanDict',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 4, marginRight: 4 }}>
          <Pressable onPress={handleNewSession} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="add-circle-outline" size={24} color={colors.tint} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="settings-outline" size={22} color={colors.icon} />
          </Pressable>
        </View>
      ),
    });
  }, [sessionTitle, colors]);

  // ── Load / create session ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    if (!apiClient) return;
    initSession(params.sessionId ?? null);
  }, [isLoaded, apiClient, params.sessionId]);

  // ── Inject prompt param (from kanji tab) ──────────────────────────────────
  useEffect(() => {
    if (params.prompt) setInput(params.prompt);
  }, [params.prompt]);

  // ── Share intent ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasShareIntent && shareIntent?.text && sessionId) {
      const text = shareIntent.text;
      resetShareIntent();
      sendMessage(text);
    }
  }, [hasShareIntent, sessionId]);

  const initSession = async (targetId: string | null) => {
    if (!apiClient) return;
    setIsLoadingSession(true);
    setError(null);
    try {
      let id = targetId ?? (await SecureStore.getItemAsync(SESSION_KEY));
      if (id) {
        const session = await apiClient.getSession(id).catch(() => null);
        if (session) {
          setSessionId(session.id);
          setSessionTitle(session.title || '');
          setMessages(session.messages.map((m, i) => ({ ...m, localId: `${m.timestamp}_${i}` })));
          msgCountRef.current = session.messages.length;
          await SecureStore.setItemAsync(SESSION_KEY, session.id);
          return;
        }
      }
      const session = await apiClient.createSession();
      setSessionId(session.id);
      setSessionTitle('');
      setMessages([]);
      msgCountRef.current = 0;
      await SecureStore.setItemAsync(SESSION_KEY, session.id);
    } catch {
      setError('Failed to load session. Check your settings.');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleNewSession = async () => {
    if (!apiClient) return;
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsLoadingSession(true);
    setError(null);
    try {
      const session = await apiClient.createSession();
      setSessionId(session.id);
      setSessionTitle('');
      setMessages([]);
      setInput('');
      msgCountRef.current = 0;
      await SecureStore.setItemAsync(SESSION_KEY, session.id);
    } catch {
      setError('Failed to create new session.');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || !sessionId || !apiClient || isStreaming || isSendingRef.current) return;

      isSendingRef.current = true;
      setInput('');
      setError(null);
      setIsStreaming(true);

      const userMsg: Message = {
        localId: `${Date.now()}_u`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      const assistantId = `${Date.now()}_a`;
      const assistantMsg: Message = {
        localId: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      const abort = new AbortController();
      abortRef.current = abort;
      const isFirst = msgCountRef.current === 0;

      apiClient.sendMessageStream(
        sessionId,
        text,
        (token) => {
          setMessages((prev) => {
            const idx = prev.findLastIndex((m) => m.localId === assistantId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], content: next[idx].content + token, isStreaming: true };
            return next;
          });
          flatListRef.current?.scrollToEnd({ animated: false });
        },
        () => {
          setMessages((prev) => {
            const idx = prev.findLastIndex((m) => m.localId === assistantId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], isStreaming: false };
            return next;
          });
          msgCountRef.current += 2;
          setIsStreaming(false);
          isSendingRef.current = false;
          if (isFirst) {
            apiClient.getSession(sessionId).then((s) => {
              if (s?.title) setSessionTitle(s.title);
            }).catch(() => { });
          }
        },
        (err) => {
          setError(err.message);
          setMessages((prev) => prev.filter((m) => m.localId !== assistantId));
          setIsStreaming(false);
          isSendingRef.current = false;
        },
        abort.signal,
      );
    },
    [input, sessionId, apiClient, isStreaming],
  );

  if (!isLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (!apiClient) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>JapanDict</Text>
        <Text style={[styles.emptyText, { color: colors.icon }]}>
          Configure your API key and backend URL to get started.
        </Text>
        <TouchableOpacity
          style={[styles.setupButton, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/settings')}>
          <Text style={styles.setupButtonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior='height'
      keyboardVerticalOffset={80}>
      {isLoadingSession && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>JapanDict</Text>
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            Send any Japanese text and I'll break down the kanji, grammar, and vocabulary.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.localId}
          renderItem={({ item }) => <ChatBubble message={item} colors={colors} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={{ color: '#e74c3c', fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.inputRow,
          {
            borderTopColor: colors.icon + '30',
            backgroundColor: colors.background,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          },
        ]}>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: colorScheme === 'dark' ? '#1e2022' : '#f0f0f0',
              color: colors.text,
            },
          ]}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about Japanese text..."
          placeholderTextColor={colors.icon}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor:
                isStreaming || !input.trim() ? colors.icon + '44' : colors.tint,
            },
          ]}
          onPress={() => sendMessage()}
          disabled={isStreaming || !input.trim()}>
          <Ionicons name={isStreaming ? 'stop' : 'arrow-up'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  setupButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  setupButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  messageList: { padding: 12, paddingBottom: 20 },
  bubbleRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end', gap: 8 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14 },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAssistant: { borderBottomLeftRadius: 4 },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e74c3c22',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  codeInline: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'Courier New',
    fontSize: 13,
  },
  codeBlock: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 6,
    fontFamily: 'Courier New',
    fontSize: 13,
    marginVertical: 8,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 8,
  },
  link: {
    textDecorationLine: 'underline',
  },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },
});
