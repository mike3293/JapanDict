import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';

export default function ProcessTextHandler() {
  const { content } = useLocalSearchParams<{ content: string }>();
  const router = useRouter();

  useEffect(() => {
    // Log incoming param and the initial URL so we can debug why this screen
    // might not be receiving the deep link params.
    console.log('process-text - content param:', content);

    Linking.getInitialURL()
      .then((url) => console.log('process-text - initial URL:', url))
      .catch((e) => console.warn('process-text - failed to get initial URL', e));

    // Show an alert for debugging even if content is empty/undefined.
    Alert.alert('Captured Text', content ?? '<<no content received>>');

    // If you want to navigate into your app UI instead of staying on this
    // invisible handler, uncomment and use router.replace as needed.
    // router.replace({ pathname: '/chat', params: { incomingText: content } });
  }, [content]);

  return null; // This screen is invisible to the user
}