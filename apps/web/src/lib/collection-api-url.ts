type CollectionApiUrlOptions = {
  nodeEnv?: string;
  internalApiUrl?: string;
  publicApiUrl?: string;
  cloudApiUrl: string;
};

const LOCAL_API_URL = "http://localhost:4100";

function clean(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Collection SSR runs beside the API and may use its private loopback URL.
 * Browser engagement must never receive that address in production: it needs
 * the public same-origin proxy so session cookies accompany likes/comments.
 */
export function resolveCollectionApiUrls(options: CollectionApiUrlOptions) {
  const serverApiUrl = clean(
    options.internalApiUrl || options.publicApiUrl || LOCAL_API_URL,
  );
  const browserApiUrl = clean(
    options.publicApiUrl ||
      (options.nodeEnv === "development" ? LOCAL_API_URL : options.cloudApiUrl),
  );
  return { serverApiUrl, browserApiUrl };
}
