// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo loads this local config plugin through CommonJS.
const { withMainApplication } = require('expo/config-plugins');

const marker = '// TongZhang: explicit network retries only.';
const factory = `${marker}
    com.facebook.react.modules.network.OkHttpClientProvider.setOkHttpClientFactory {
      com.facebook.react.modules.network.OkHttpClientProvider.createClientBuilder()
        .connectionPool(okhttp3.ConnectionPool(0, 1, java.util.concurrent.TimeUnit.SECONDS))
        .retryOnConnectionFailure(false)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()
    }`;

/** Install before Expo/RN creates either fetch client. No generated native sources are tracked. */
function configureMainApplication(contents, language) {
  if (language !== 'kt')
    throw new Error('Explicit network retry policy requires Kotlin MainApplication');
  if (contents.includes(marker)) {
    const previous = /\/\/ TongZhang: explicit network retries only\.[\s\S]*?\n {4}}/;
    if (!previous.test(contents))
      throw new Error('Existing native network policy was not recognized');
    return contents.replace(previous, factory);
  }
  const anchor = /super\.onCreate\(\)/;
  if (!anchor.test(contents)) throw new Error('MainApplication onCreate anchor was not found');
  return contents.replace(anchor, (match) => `${match}\n    ${factory}`);
}
function withExplicitNetworkRetries(config) {
  return withMainApplication(config, (mod) => {
    mod.modResults.contents = configureMainApplication(
      mod.modResults.contents,
      mod.modResults.language,
    );
    return mod;
  });
}
module.exports = withExplicitNetworkRetries;
module.exports.configureMainApplication = configureMainApplication;
