import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import type {
  ContentDrawerLayout,
  ProjectContentEntry,
  ProjectContentImportResult,
  ProjectContentKind
} from '../shared/types';
import type { LauncherApi } from './launcherApi';
import './project-content-drawer.css';

const contentKinds: Array<{ kind: ProjectContentKind; label: string; accept: string }> = [
  { kind: 'mods', label: 'Mods', accept: '.jar' },
  { kind: 'resourcepacks', label: 'Resource Packs', accept: '.zip' },
  { kind: 'shaderpacks', label: 'Shaders', accept: '.zip' }
];

const emptyEntries: Record<ProjectContentKind, ProjectContentEntry[]> = {
  mods: [],
  resourcepacks: [],
  shaderpacks: []
};

const starSettings = [
  { y: -25, size: 1, x: -14, drift: -9, delay: 0 },
  { y: -18, size: 2, x: 7, drift: 12, delay: 30 },
  { y: -10, size: 1, x: -6, drift: -17, delay: 60 },
  { y: -3, size: 3, x: 13, drift: 8, delay: 18 },
  { y: 5, size: 2, x: -18, drift: -11, delay: 48 },
  { y: 12, size: 1, x: 4, drift: 17, delay: 78 },
  { y: 20, size: 2, x: -8, drift: -7, delay: 36 },
  { y: 27, size: 1, x: 16, drift: 10, delay: 66 },
  { y: 34, size: 3, x: -13, drift: -15, delay: 12 },
  { y: 42, size: 1, x: 9, drift: 6, delay: 54 }
];

const toggleStarSettings = [
  { size: 1, x: -12, y: -6, delay: 0 },
  { size: 2, x: 10, y: -9, delay: 16 },
  { size: 1, x: 15, y: 2, delay: 32 },
  { size: 3, x: 9, y: 12, delay: 8 },
  { size: 2, x: -7, y: 14, delay: 24 },
  { size: 1, x: -15, y: 7, delay: 40 },
  { size: 2, x: -6, y: -15, delay: 12 },
  { size: 1, x: 6, y: 16, delay: 28 }
];

interface ProjectContentDrawerProps {
  api: LauncherApi;
  projectId: string;
  open: boolean;
  layout: ContentDrawerLayout;
  refreshKey: number;
  onOpenChange(open: boolean): void;
  onLayoutChange(layout: ContentDrawerLayout): void;
}

interface ConflictState {
  files: File[];
  result: ProjectContentImportResult;
}

interface ToggleEffectState {
  kind: ProjectContentKind;
  name: string;
  nonce: number;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const finalMessage = message.split('\n')[0]
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '');
  return finalMessage || 'Something went wrong.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatModified(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function resultNotice(result: ProjectContentImportResult): string {
  const parts: string[] = [];
  if (result.imported.length) parts.push(`Added ${result.imported.length} file${result.imported.length === 1 ? '' : 's'}.`);
  if (result.rejected.length) {
    parts.push(result.rejected.map((entry) => `${entry.name}: ${entry.message}`).join(' '));
  }
  return parts.join(' ') || 'No files were added.';
}

export function ProjectContentDrawer({
  api,
  projectId,
  open,
  layout,
  refreshKey,
  onOpenChange,
  onLayoutChange
}: ProjectContentDrawerProps) {
  const [activeKind, setActiveKind] = useState<ProjectContentKind>('mods');
  const [entries, setEntries] = useState(emptyEntries);
  const [loading, setLoading] = useState<Record<ProjectContentKind, boolean>>({
    mods: false,
    resourcepacks: false,
    shaderpacks: false
  });
  const [errors, setErrors] = useState<Partial<Record<ProjectContentKind, string>>>({});
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<ProjectContentEntry | null>(null);
  const [working, setWorking] = useState(false);
  const [burst, setBurst] = useState(0);
  const [toggleEffect, setToggleEffect] = useState<ToggleEffectState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  const activeConfig = contentKinds.find((entry) => entry.kind === activeKind) ?? contentKinds[0];

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const loadKind = useCallback(async (kind: ProjectContentKind) => {
    setLoading((current) => ({ ...current, [kind]: true }));
    setErrors((current) => ({ ...current, [kind]: undefined }));
    try {
      const result = await api.project.content.list(projectId, kind);
      setEntries((current) => ({ ...current, [kind]: result.entries }));
    } catch (error) {
      setErrors((current) => ({ ...current, [kind]: readableError(error) }));
    } finally {
      setLoading((current) => ({ ...current, [kind]: false }));
    }
  }, [api, projectId]);

  const loadAll = useCallback(async () => {
    await Promise.all(contentKinds.map(({ kind }) => loadKind(kind)));
  }, [loadKind]);

  useEffect(() => {
    if (open) void loadAll();
  }, [loadAll, open, refreshKey]);

  useEffect(() => {
    const dispose = api.window?.onContentDrawerLayout(onLayoutChange);
    return () => dispose?.();
  }, [api, onLayoutChange]);

  useEffect(() => () => {
    if (openRef.current) void api.window?.setContentDrawerOpen(false);
  }, [api]);

  async function toggleDrawer() {
    const nextOpen = !open;
    setBurst((value) => value + 1);
    setDragging(false);
    setNotice('');
    onOpenChange(nextOpen);
    try {
      const nextLayout = await api.window?.setContentDrawerOpen(nextOpen);
      onLayoutChange(nextLayout ?? 'overlay');
    } catch {
      onLayoutChange('overlay');
    }
  }

  async function importFiles(files: File[], overwrite = false) {
    if (!files.length || working) return;
    setWorking(true);
    setNotice('');
    try {
      const result = await api.project.content.importFiles(projectId, activeKind, files, overwrite);
      if (result.status === 'needs-confirmation') {
        setConflict({ files, result });
        if (result.rejected.length) setNotice(resultNotice(result));
      } else {
        setConflict(null);
        setNotice(resultNotice(result));
        await loadKind(activeKind);
      }
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setWorking(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void importFiles(Array.from(event.dataTransfer.files));
  }

  async function confirmOverwrite() {
    if (!conflict) return;
    await importFiles(conflict.files, true);
  }

  async function confirmDelete() {
    if (!deleteEntry || working) return;
    setWorking(true);
    try {
      await api.project.content.trash(projectId, deleteEntry.kind, deleteEntry.relativePath);
      setDeleteEntry(null);
      setNotice(`${deleteEntry.name} moved to the Recycle Bin.`);
      await loadKind(deleteEntry.kind);
    } catch (error) {
      setNotice(readableError(error));
      setDeleteEntry(null);
    } finally {
      setWorking(false);
    }
  }

  async function toggleEntry(entry: ProjectContentEntry) {
    if (working) return;
    const nextEnabled = !entry.enabled;
    setWorking(true);
    setNotice('');
    try {
      await api.project.content.setEnabled(projectId, entry.kind, entry.relativePath, nextEnabled);
      await loadKind(entry.kind);
      setToggleEffect({ kind: entry.kind, name: entry.name, nonce: Date.now() });
      setNotice(`${entry.name} ${nextEnabled ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setWorking(false);
    }
  }

  async function openFolder() {
    try {
      await api.project.content.openFolder(projectId, activeKind);
    } catch (error) {
      setNotice(readableError(error));
    }
  }

  const activeEntries = entries[activeKind];
  const activeError = errors[activeKind];

  return (
    <>
      <div className={`content-drawer-stars ${open ? 'open' : ''}`} aria-hidden="true">
        {burst > 0 ? starSettings.map((star, index) => (
          <span
            className="content-drawer-star"
            key={`${burst}-${index}`}
            style={{
              '--star-y': `${star.y}px`,
              '--star-size': `${star.size}px`,
              '--star-x': `${star.x}px`,
              '--star-drift': `${star.drift}px`,
              '--star-delay': `${star.delay}ms`
            } as CSSProperties}
          />
        )) : null}
      </div>
      <button
        className={`content-drawer-handle ${open ? 'open' : ''}`}
        type="button"
        onClick={toggleDrawer}
        aria-label={open ? 'Close Northvale content library' : 'Open Northvale content library'}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '›' : '‹'}</span>
      </button>
      <aside
        className={`content-drawer ${open ? 'open' : ''} ${layout}`}
        aria-label="Northvale content library"
        aria-hidden={!open}
      >
        <header className="content-drawer-header">
          <span className="content-drawer-monogram" aria-hidden="true">NV</span>
          <span className="content-drawer-title">
            <strong>Northvale Library</strong>
            <small>Manage project content</small>
          </span>
          <button className="content-drawer-close" type="button" onClick={toggleDrawer} aria-label="Close content library">×</button>
        </header>

        <div className="content-drawer-tabs" role="tablist" aria-label="Content type">
          {contentKinds.map((item) => (
            <button
              key={item.kind}
              className={item.kind === activeKind ? 'active' : ''}
              type="button"
              role="tab"
              aria-selected={item.kind === activeKind}
              onClick={() => {
                setActiveKind(item.kind);
                setDragging(false);
                setNotice('');
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          className={`content-drop-zone ${dragging ? 'dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={handleDrop}
        >
          <span className="content-drop-icon" aria-hidden="true">↓</span>
          <strong>Drop {activeConfig.accept} files here</strong>
          <small>Multiple files are supported</small>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={working}>Add Files</button>
          <input
            ref={fileInputRef}
            type="file"
            accept={activeConfig.accept}
            multiple
            tabIndex={-1}
            onChange={(event) => {
              void importFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>

        <div className="content-list-heading">
          <span>Installed</span>
          <span>{activeEntries.length} {activeEntries.length === 1 ? 'file' : 'files'}</span>
        </div>

        <div className="content-entry-list" role="tabpanel">
          {loading[activeKind] ? <div className="content-state">Loading files…</div> : null}
          {!loading[activeKind] && activeError ? (
            <div className="content-state error">
              <span>{activeError}</span>
              <button type="button" onClick={() => void loadKind(activeKind)}>Retry</button>
            </div>
          ) : null}
          {!loading[activeKind] && !activeError && activeEntries.length === 0 ? (
            <div className="content-state empty">
              <strong>No {activeConfig.label.toLowerCase()} added</strong>
              <span>Drop files above or choose Add Files.</span>
            </div>
          ) : null}
          {!loading[activeKind] && !activeError ? activeEntries.map((entry) => (
            <article className={`content-entry ${entry.enabled ? 'enabled' : 'disabled'}`} key={entry.relativePath}>
              <span className="content-entry-file" aria-hidden="true">{entry.kind === 'mods' ? 'JAR' : 'ZIP'}</span>
              <span className="content-entry-copy">
                <strong title={entry.name}>{entry.name}</strong>
                <small>{formatBytes(entry.size)} · {formatModified(entry.modifiedAt)}</small>
              </span>
              <span className="content-entry-actions">
                <span className="content-toggle-wrap">
                  {toggleEffect?.kind === entry.kind && toggleEffect.name === entry.name ? (
                    <span className="content-toggle-stars" aria-hidden="true">
                      {toggleStarSettings.map((star, index) => (
                        <span
                          className="content-toggle-star"
                          key={`${toggleEffect.nonce}-${index}`}
                          style={{
                            '--toggle-star-size': `${star.size}px`,
                            '--toggle-star-x': `${star.x}px`,
                            '--toggle-star-y': `${star.y}px`,
                            '--toggle-star-delay': `${star.delay}ms`
                          } as CSSProperties}
                        />
                      ))}
                    </span>
                  ) : null}
                  <button
                    className={`content-toggle ${entry.enabled ? 'active' : ''}`}
                    type="button"
                    role="switch"
                    aria-checked={entry.enabled}
                    aria-label={`${entry.enabled ? 'Disable' : 'Enable'} ${entry.name}`}
                    title={entry.enabled ? 'Disable file' : 'Enable file'}
                    onClick={() => void toggleEntry(entry)}
                    disabled={working}
                  >
                    <span aria-hidden="true" />
                  </button>
                </span>
                {entry.canDelete ? (
                  <button
                    className="content-delete"
                    type="button"
                    onClick={() => setDeleteEntry(entry)}
                    aria-label={`Move ${entry.name} to Recycle Bin`}
                    title="Move to Recycle Bin"
                    disabled={working}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </article>
          )) : null}
        </div>

        <div className="content-drawer-footer">
          {notice ? <div className="content-notice" role="status">{notice}</div> : null}
          <button type="button" onClick={() => void openFolder()}>
            <span aria-hidden="true">□</span> Open Folder
          </button>
        </div>
      </aside>

      {conflict ? (
        <div className="content-modal-backdrop" role="presentation">
          <section className="content-modal" role="dialog" aria-modal="true" aria-labelledby="content-conflict-title">
            <span className="content-modal-mark" aria-hidden="true">!</span>
            <h2 id="content-conflict-title">Replace existing files?</h2>
            <p>{conflict.result.conflicts.length} file{conflict.result.conflicts.length === 1 ? '' : 's'} already exist in this folder.</p>
            <div className="content-conflict-names">
              {conflict.result.conflicts.map((name) => <span key={name}>{name}</span>)}
            </div>
            <div className="content-modal-actions">
              <button type="button" onClick={() => setConflict(null)} disabled={working}>Cancel</button>
              <button className="primary" type="button" onClick={() => void confirmOverwrite()} disabled={working}>
                {working ? 'Replacing…' : 'Replace Files'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteEntry ? (
        <div className="content-modal-backdrop" role="presentation">
          <section className="content-modal" role="dialog" aria-modal="true" aria-labelledby="content-delete-title">
            <span className="content-modal-mark" aria-hidden="true">×</span>
            <h2 id="content-delete-title">Move file to Recycle Bin?</h2>
            <p><strong>{deleteEntry.name}</strong> will be removed from Northvale. You can restore it from the Recycle Bin.</p>
            <div className="content-modal-actions">
              <button type="button" onClick={() => setDeleteEntry(null)} disabled={working}>Cancel</button>
              <button className="primary" type="button" onClick={() => void confirmDelete()} disabled={working}>
                {working ? 'Moving…' : 'Move to Recycle Bin'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
