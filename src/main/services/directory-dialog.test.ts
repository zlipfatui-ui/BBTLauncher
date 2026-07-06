import { describe, expect, it, vi } from 'vitest';
import { selectAppDirectory } from './directory-dialog';

describe('app directory dialog', () => {
  it('returns the selected folder', async () => {
    const dialog = {
      showOpenDialog: vi.fn(async () => ({
        canceled: false,
        filePaths: ['D:/NorthvaleData']
      }))
    };

    await expect(selectAppDirectory(dialog, 'C:/old-root')).resolves.toBe('D:/NorthvaleData');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'C:/old-root',
      properties: ['openDirectory', 'createDirectory']
    }));
  });

  it('returns null when selection is cancelled', async () => {
    const dialog = {
      showOpenDialog: vi.fn(async () => ({
        canceled: true,
        filePaths: []
      }))
    };

    await expect(selectAppDirectory(dialog, 'C:/old-root')).resolves.toBeNull();
  });
});
