const ABSOLUTE_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;

export function resolveRendererAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  if (!path || ABSOLUTE_URL_PATTERN.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  if (!path.startsWith('/')) return path;

  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${path.slice(1)}`;
}
