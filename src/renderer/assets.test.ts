import { describe, expect, it } from 'vitest';
import { resolveRendererAssetUrl } from './assets';

describe('resolveRendererAssetUrl', () => {
  it('keeps dev-server absolute public asset paths when the base URL is root', () => {
    expect(resolveRendererAssetUrl('/assets/images/logos/ss0-cover.jpg', '/')).toBe(
      '/assets/images/logos/ss0-cover.jpg'
    );
  });

  it('rewrites public asset paths for Electron file builds', () => {
    expect(resolveRendererAssetUrl('/assets/images/logos/ss0-cover.jpg', './')).toBe(
      './assets/images/logos/ss0-cover.jpg'
    );
  });

  it('does not rewrite external URLs', () => {
    expect(resolveRendererAssetUrl('https://example.test/image.jpg', './')).toBe('https://example.test/image.jpg');
  });
});
