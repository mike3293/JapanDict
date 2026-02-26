const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'patches_src', 'ExpoShareIntentModule.kt');
const dest = path.join(__dirname, '..', 'node_modules', 'expo-share-intent', 'android', 'src', 'main', 'java', 'expo', 'modules', 'shareintent', 'ExpoShareIntentModule.kt');

console.log('Applying native file patch...');
try {
  if (!fs.existsSync(src)) {
    console.warn('Source patch file not found:', src);
    process.exit(0);
  }
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Patched', dest);
} catch (err) {
  console.error('Failed to apply native patch:', err);
  process.exit(1);
}
