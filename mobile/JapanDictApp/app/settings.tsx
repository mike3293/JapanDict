import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import { DEFAULT_BACKEND_URL, useSettingsContext } from '@/contexts/settings-context';
import { Colors } from '@/constants/theme';

export default function SettingsScreen() {
  const { apiKey, backendUrl, saveSettings } = useSettingsContext();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftUrl, setDraftUrl] = useState(backendUrl || DEFAULT_BACKEND_URL);

  useEffect(() => {
    setDraftKey(apiKey);
    setDraftUrl(backendUrl || DEFAULT_BACKEND_URL);
  }, [apiKey, backendUrl]);

  const handleSave = async () => {
    if (!draftKey.trim()) {
      Alert.alert('API Key required', 'Please enter your X-Api-Key value.');
      return;
    }
    if (!draftUrl.trim()) {
      Alert.alert('Backend URL required', 'Please enter the backend URL.');
      return;
    }
    await saveSettings({ apiKey: draftKey.trim(), backendUrl: draftUrl.trim() });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.text }]}>Backend URL</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.icon, color: colors.text, backgroundColor: colorScheme === 'dark' ? '#1e2022' : '#f5f5f5' }]}
          value={draftUrl}
          onChangeText={setDraftUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://..."
          placeholderTextColor={colors.icon}
        />

        <Text style={[styles.label, { color: colors.text }]}>API Key (X-Api-Key)</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.icon, color: colors.text, backgroundColor: colorScheme === 'dark' ? '#1e2022' : '#f5f5f5' }]}
          value={draftKey}
          onChangeText={setDraftKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="your-api-key"
          placeholderTextColor={colors.icon}
        />

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.tint }]}
          onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: 20,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveButton: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
