export interface DirectoryDialog {
  showOpenDialog(options: {
    defaultPath?: string;
    properties: Array<'openDirectory' | 'createDirectory'>;
  }): Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
}

export async function selectAppDirectory(dialog: DirectoryDialog, defaultPath?: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    defaultPath,
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled) return null;
  return result.filePaths[0] || null;
}
