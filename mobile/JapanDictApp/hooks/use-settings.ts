import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

import { ApiClient } from '@/services/api';

const KEY_API_KEY = 'japandict_api_key';
const KEY_BACKEND_URL = 'japandict_backend_url';

export const DEFAULT_BACKEND_URL = 'https://japandict-api.azurewebsites.net';

export interface Settings {
  apiKey: string;
  backendUrl: string;
}

export function useSettings() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    apiKey: '',
    backendUrl: DEFAULT_BACKEND_URL,
  });

  useEffect(() => {
    (async () => {
      const [apiKey, backendUrl] = await Promise.all([
        SecureStore.getItemAsync(KEY_API_KEY),
        SecureStore.getItemAsync(KEY_BACKEND_URL),
      ]);
      setSettings({
        apiKey: apiKey ?? '',
        backendUrl: backendUrl ?? DEFAULT_BACKEND_URL,
      });
      setIsLoaded(true);
    })();
  }, []);

  const saveSettings = useCallback(async (next: Partial<Settings>) => {
    const updated = { ...settings, ...next };
    setSettings(updated);
    await Promise.all([
      SecureStore.setItemAsync(KEY_API_KEY, updated.apiKey),
      SecureStore.setItemAsync(KEY_BACKEND_URL, updated.backendUrl),
    ]);
  }, [settings]);

  const apiClient = settings.apiKey && settings.backendUrl
    ? new ApiClient(settings.backendUrl, settings.apiKey)
    : null;

  return { settings, saveSettings, isLoaded, apiClient };
}
