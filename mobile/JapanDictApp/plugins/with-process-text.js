const { withMainActivity } = require('expo/config-plugins');

const PROCESS_TEXT_HELPERS = `
  private fun mapProcessTextIntent(intent: Intent): Intent {
    if (intent.action != Intent.ACTION_PROCESS_TEXT) {
      return intent
    }

    val sharedText = intent.getStringExtra(Intent.EXTRA_PROCESS_TEXT)
    if (sharedText.isNullOrBlank()) {
      return intent
    }

    val deepLink = Uri.parse("japandict://process-text")
      .buildUpon()
      .appendQueryParameter("content", sharedText)
      .build()

    return Intent(Intent.ACTION_VIEW, deepLink).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      setPackage(packageName)
    }
  }
`;

function ensureImport(src, importLine) {
  if (src.includes(importLine)) {
    return src;
  }

  const packageMatch = src.match(/^package\s+[^\n]+\n/m);
  if (!packageMatch) {
    return `${importLine}\n${src}`;
  }

  const packageEnd = packageMatch.index + packageMatch[0].length;
  const rest = src.slice(packageEnd);
  const importMatches = [...rest.matchAll(/^import\s+[^\n]+\n/gm)];

  if (importMatches.length === 0) {
    return `${src.slice(0, packageEnd)}\n${importLine}\n${rest}`;
  }

  const lastImport = importMatches[importMatches.length - 1];
  const insertAt = packageEnd + lastImport.index + lastImport[0].length;
  return `${src.slice(0, insertAt)}${importLine}\n${src.slice(insertAt)}`;
}

function ensureHelperMethod(src) {
  if (src.includes('private fun mapProcessTextIntent(intent: Intent): Intent')) {
    return src;
  }

  if (src.includes('private fun handleProcessTextIntent(intent: Intent)')) {
    return src
      .replace(/\n\s*private fun handleProcessTextIntent\(intent: Intent\)[\s\S]*?\n\s*}\n/, '\n')
      .replace(/\n}\s*$/, `${PROCESS_TEXT_HELPERS}\n}`);
  }

  return src.replace(/\n}\s*$/, `${PROCESS_TEXT_HELPERS}\n}`);
}

function ensureOnCreateIntentMapping(src) {
  if (src.includes('setIntent(mapProcessTextIntent(intent))')) {
    return src;
  }

  if (src.includes('handleProcessTextIntent(intent)')) {
    return src.replace('handleProcessTextIntent(intent)', 'setIntent(mapProcessTextIntent(intent))');
  }

  if (src.includes('super.onCreate(null)')) {
    return src.replace('super.onCreate(null)', 'super.onCreate(null)\n    setIntent(mapProcessTextIntent(intent))');
  }

  if (src.includes('super.onCreate(savedInstanceState)')) {
    return src.replace(
      'super.onCreate(savedInstanceState)',
      'super.onCreate(savedInstanceState)\n    setIntent(mapProcessTextIntent(intent))',
    );
  }

  return src;
}

function ensureOnNewIntent(src) {
  const newMethod = `override fun onNewIntent(intent: Intent) {\n    val mappedIntent = mapProcessTextIntent(intent)\n    super.onNewIntent(mappedIntent)\n    setIntent(mappedIntent)\n  }`;

  if (src.includes(newMethod)) {
    return src;
  }

  if (src.includes('override fun onNewIntent(intent: Intent?)')) {
    return src.replace(
      /override fun onNewIntent\(intent: Intent\?\) \{[\s\S]*?\n\s*}\n/,
      `${newMethod}\n`,
    );
  }

  if (src.includes('override fun onNewIntent(intent: Intent)')) {
    return src.replace(/override fun onNewIntent\(intent: Intent\) \{[\s\S]*?\n\s*}\n/, `${newMethod}\n`);
  }

  const marker = 'override fun getMainComponentName(): String = "main"';
  if (src.includes(marker)) {
    return src.replace(marker, `${newMethod}\n\n  ${marker}`);
  }

  return src;
}

module.exports = function withProcessText(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('with-process-text plugin only supports Kotlin MainActivity files.');
    }

    let src = mod.modResults.contents;
    src = ensureImport(src, 'import android.content.Intent');
    src = ensureImport(src, 'import android.net.Uri');
    src = ensureOnCreateIntentMapping(src);
    src = ensureOnNewIntent(src);
    src = ensureHelperMethod(src);

    mod.modResults.contents = src;
    return mod;
  });
};
