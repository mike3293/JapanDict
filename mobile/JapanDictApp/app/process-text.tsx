import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

export default function ProcessTextHandler() {
  const { content } = useLocalSearchParams<{ content?: string }>();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!rootNavigationState?.key || hasNavigatedRef.current) {
      return;
    }

    hasNavigatedRef.current = true;
    const incomingText = content?.trim();

    router.replace({
      pathname: '/(tabs)/index',
      params: incomingText ? { sharedText: incomingText } : undefined,
    });
  }, [content, rootNavigationState?.key, router]);

  return null;
}
