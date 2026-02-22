import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { ApiClient } from '@/services/api';

const KEY_API_KEY = 'japandict_api_key';
const KEY_BACKEND_URL = 'japandict_backend_url';

export const DEFAULT_BACKEND_URL = 'https://japandict-api.azurewebsites.net';

interface SettingsContextValue {
  apiKey: string;
  backendUrl: string;
  isLoaded: boolean;
  apiClient: ApiClient | null;
  saveSettings: (next: { apiKey?: string; backendUrl?: string }) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  apiKey: '',
  backendUrl: DEFAULT_BACKEND_URL,
  isLoaded: false,
  apiClient: null,
  saveSettings: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);

  useEffect(() => {
    (async () => {
      const [storedKey, storedUrl] = await Promise.all([
        SecureStore.getItemAsync(KEY_API_KEY),
        SecureStore.getItemAsync(KEY_BACKEND_URL),
      ]);
      if (storedKey) setApiKey(storedKey);
      if (storedUrl) setBackendUrl(storedUrl);
      setIsLoaded(true);
    })();
  }, []);

  const saveSettings = useCallback(
    async (next: { apiKey?: string; backendUrl?: string }) => {
      const newKey = next.apiKey ?? apiKey;
      const newUrl = next.backendUrl ?? backendUrl;
      setApiKey(newKey);
      setBackendUrl(newUrl);
      await Promise.all([
        SecureStore.setItemAsync(KEY_API_KEY, newKey),
        SecureStore.setItemAsync(KEY_BACKEND_URL, newUrl),
      ]);
    },
    [apiKey, backendUrl],
  );

  const apiClient =
    apiKey && backendUrl ? new ApiClient(backendUrl, apiKey) : null;

  return (
    <SettingsContext.Provider value={{ apiKey, backendUrl, isLoaded, apiClient, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettingsContext = () => useContext(SettingsContext);
