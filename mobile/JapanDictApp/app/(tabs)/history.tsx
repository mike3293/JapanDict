import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useSettingsContext } from '@/contexts/settings-context';
import type { ChatSessionInfo } from '@/services/api';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function SessionRow({
  session,
  colors,
  onPress,
}: {
  session: ChatSessionInfo;
  colors: typeof Colors.light;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.icon + '20' }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {session.title || 'Untitled conversation'}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.icon }]}>
          {formatDate(session.updatedAt ?? session.createdAt)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.icon} />
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { apiClient } = useSettingsContext();

  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!apiClient) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load sessions. Check your settings.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useFocusEffect(useCallback(() => { loadSessions(); }, [loadSessions]));

  const handleTap = (session: ChatSessionInfo) => {
    router.navigate({ pathname: '/(tabs)', params: { sessionId: session.id } });
  };

  if (!apiClient) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.icon }]}>
          Configure your API key in Settings to see your history.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: '#e74c3c', textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.tint }]}
            onPress={loadSessions}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            No conversations yet. Start chatting!
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionRow session={item} colors={colors} onPress={() => handleTap(item)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowPreview: { fontSize: 13, lineHeight: 18 },
  rowMeta: { fontSize: 11 },
});
