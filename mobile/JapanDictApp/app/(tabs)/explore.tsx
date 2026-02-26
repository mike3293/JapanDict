import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useSettingsContext } from '@/contexts/settings-context';
import type { KanjiEntry } from '@/services/api';

const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const JLPT_COLORS: Record<string, string> = {
  N5: '#3498db',
  N4: '#2ecc71',
  N3: '#f1c40f',
  N2: '#e67e22',
  N1: '#e74c3c',
};

function JlptBadge({ level }: { level?: string }) {
  if (!level) return null;
  return (
    <View style={[badge.container, { backgroundColor: (JLPT_COLORS[level] ?? '#999') + '22' }]}>
      <Text style={[badge.text, { color: JLPT_COLORS[level] ?? '#999' }]}>{level}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  container: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  text: { fontSize: 11, fontWeight: '700' },
});

function KanjiCard({
  entry,
  colors,
  onPress,
}: {
  entry: KanjiEntry;
  colors: typeof Colors.light;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[card.container, { backgroundColor: colors.icon + '11', borderColor: colors.icon + '22' }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <Text style={[card.character, { color: colors.text }]}>{entry.character}</Text>
      <View style={card.info}>
        <View style={card.infoTop}>
          <Text style={[card.readings, { color: colors.tint }]} numberOfLines={1}>
            {entry.readings.join('  ·  ')}
          </Text>
          <JlptBadge level={entry.jlptLevel} />
        </View>
        <Text style={[card.meanings, { color: colors.text }]} numberOfLines={2}>
          {entry.meanings.join(', ')}
        </Text>
        <Text style={[card.count, { color: colors.icon }]}>
          Seen {entry.occurrenceCount}×
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.icon} style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

const card = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    alignItems: 'stretch',
  },
  character: { fontSize: 38, fontWeight: '700', width: 48, textAlign: 'center', alignSelf: 'center' },
  info: { flex: 1, gap: 3 },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readings: { fontSize: 14, fontWeight: '500', flex: 1 },
  meanings: { fontSize: 13, lineHeight: 18 },
  count: { fontSize: 11 },
});

export default function KanjiScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { apiClient } = useSettingsContext();

  const [allKanji, setAllKanji] = useState<KanjiEntry[]>([]);
  const [filtered, setFiltered] = useState<KanjiEntry[]>([]);
  const [query, setQuery] = useState('');
  const [jlptFilter, setJlptFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    if (!apiClient) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getKanji();
      setAllKanji(data);
      setFiltered(data);
    } catch (e) {
      setError('Failed to load kanji. Check your settings.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const applyFilter = useCallback(
    (q: string, jlpt: string | null, data: KanjiEntry[]) => {
      let result = data;
      if (jlpt) result = result.filter((k) => k.jlptLevel === jlpt);
      if (q.trim()) {
        const lq = q.toLowerCase();
        result = result.filter(
          (k) =>
            k.character.includes(q) ||
            k.readings.some((r) => r.includes(q)) ||
            k.meanings.some((m) => m.toLowerCase().includes(lq)),
        );
      }
      setFiltered(result);
    },
    [],
  );

  const handleSearch = (q: string) => {
    setQuery(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (q.trim()) {
      searchRef.current = setTimeout(async () => {
        if (!apiClient) return;
        try {
          const results = await apiClient.searchKanji(q);
          const withJlpt = jlptFilter ? results.filter((k) => k.jlptLevel === jlptFilter) : results;
          setFiltered(withJlpt);
        } catch {
          applyFilter(q, jlptFilter, allKanji);
        }
      }, 400);
    } else {
      applyFilter('', jlptFilter, allKanji);
    }
  };

  const handleJlptFilter = (level: string | null) => {
    const next = jlptFilter === level ? null : level;
    setJlptFilter(next);
    applyFilter(query, next, allKanji);
  };

  const handleTapKanji = (entry: KanjiEntry) => {
    router.navigate({
      pathname: '/(tabs)',
      params: { prompt: entry.character },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search */}
      <View style={[styles.searchRow, { borderBottomColor: colors.icon + '20' }]}>
        <View style={[styles.searchBox, { backgroundColor: colorScheme === 'dark' ? '#1e2022' : '#f0f0f0' }]}>
          <Ionicons name="search" size={16} color={colors.icon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search character, reading, meaning..."
            placeholderTextColor={colors.icon}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.icon} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* JLPT filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}>
        {JLPT_LEVELS.map((level) => (
          <Pressable
            key={level}
            style={[
              styles.pill,
              {
                backgroundColor:
                  jlptFilter === level ? JLPT_COLORS[level] : JLPT_COLORS[level] + '22',
              },
            ]}
            onPress={() => handleJlptFilter(level)}>
            <Text
              style={[
                styles.pillText,
                { color: jlptFilter === level ? '#fff' : JLPT_COLORS[level] },
              ]}>
              {level}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Count */}
      <Text style={[styles.countText, { color: colors.icon }]}>
        {filtered.length} kanji
      </Text>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: '#e74c3c', textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.tint }]} onPress={loadAll}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            {allKanji.length === 0
              ? 'No kanji yet. Start a chat to build your dictionary.'
              : 'No results for that search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <KanjiCard entry={item} colors={colors} onPress={() => handleTapKanji(item)} />
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  pillRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillText: { fontWeight: '700', fontSize: 13 },
  countText: { marginHorizontal: 14, marginBottom: 4, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
});
