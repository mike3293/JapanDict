import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function ProcessTextHandler() {
  const { content } = useLocalSearchParams<{ content?: string }>();
  const router = useRouter();

  useEffect(() => {
    const incomingText = content?.trim();

    router.replace({
      pathname: '/(tabs)',
      params: incomingText ? { sharedText: incomingText } : undefined,
    });
  }, [content, router]);

  return null;
}
