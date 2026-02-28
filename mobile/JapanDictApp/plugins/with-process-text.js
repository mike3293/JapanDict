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

    val deepLink = Uri.parse("japandict://process-text?content=")
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

function ensureImport(src, value) {
  if (src.includes(value)) {
    return src;
  }

  return `${value}\n${src}`;
}

function ensureHandleMethod(src) {
  if (src.includes('handleProcessTextIntent(intent: Intent?)')) {
    return src;
  }

  return src.replace(/\n}\s*$/, `${PROCESS_TEXT_HANDLER}\n}`);
}

function ensureOnCreateCall(src) {
  const target = 'super.onCreate(null)';
  if (!src.includes(target) || src.includes('handleProcessTextIntent(intent)')) {
    return src;
  }

  return src.replace(target, `${target}\n    handleProcessTextIntent(intent)`);
}

function ensureOnNewIntent(src) {
  if (src.includes('override fun onNewIntent(intent: Intent?)')) {
    return src;
  }

  return src.replace(
    /override fun onCreate\(savedInstanceState: Bundle\?\) \{[\s\S]*?\n  }/,
    (match) => `${match}\n\n  override fun onNewIntent(intent: Intent?) {\n    super.onNewIntent(intent)\n    setIntent(intent)\n    handleProcessTextIntent(intent)\n  }`,
  );
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
