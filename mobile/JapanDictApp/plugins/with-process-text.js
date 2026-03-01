const { withMainActivity } = require('expo/config-plugins');

const PROCESS_TEXT_HANDLER = `
  private fun handleProcessTextIntent(intent: Intent?) {
    if (intent?.action != Intent.ACTION_PROCESS_TEXT) {
      return
    }

    val sharedText = intent.getStringExtra(Intent.EXTRA_PROCESS_TEXT)
    if (sharedText.isNullOrBlank()) {
      return
    }

    val deepLink = Uri.parse("japandict://process-text")
      .buildUpon()
      .appendQueryParameter("content", sharedText)
      .build()

    val routeIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      setPackage(packageName)
    }

    startActivity(routeIntent)
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

function ensureHandleMethod(src) {
  if (src.includes('handleProcessTextIntent(intent: Intent?)')) {
    return src;
  }

  return src.replace(/\n}\s*$/, `${PROCESS_TEXT_HANDLER}\n}`);
}

function ensureOnCreateCall(src) {
  if (src.includes('handleProcessTextIntent(intent)')) {
    return src;
  }

  if (src.includes('super.onCreate(null)')) {
    return src.replace('super.onCreate(null)', 'super.onCreate(null)\n    handleProcessTextIntent(intent)');
  }

  if (src.includes('super.onCreate(savedInstanceState)')) {
    return src.replace(
      'super.onCreate(savedInstanceState)',
      'super.onCreate(savedInstanceState)\n    handleProcessTextIntent(intent)',
    );
  }

  return src;
}

function ensureOnNewIntent(src) {
  if (src.includes('override fun onNewIntent(intent: Intent?)')) {
    return src;
  }

  const marker = 'override fun getMainComponentName(): String = "main"';
  if (src.includes(marker)) {
    return src.replace(
      marker,
      `override fun onNewIntent(intent: Intent?) {\n    super.onNewIntent(intent)\n    setIntent(intent)\n    handleProcessTextIntent(intent)\n  }\n\n  ${marker}`,
    );
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
    src = ensureOnCreateCall(src);
    src = ensureOnNewIntent(src);
    src = ensureHandleMethod(src);

    mod.modResults.contents = src;
    return mod;
  });
};
