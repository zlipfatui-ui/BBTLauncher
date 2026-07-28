import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type {
  ContentDrawerLayout,
  ProjectContentEntry,
  ProjectContentImportResult,
  ProjectContentKind
} from '../shared/types';
import type { LauncherApi } from './launcherApi';
import './project-content-drawer.css';

const contentKinds: Array<{ kind: ProjectContentKind; label: string; accept: string }> = [
  { kind: 'mods', label: 'MODS', accept: '.jar' },
  { kind: 'resourcepacks', label: 'RESOURCE PACKS', accept: '.zip' },
  { kind: 'shaderpacks', label: 'SHADERS', accept: '.zip' }
];

const emptyEntries: Record<ProjectContentKind, ProjectContentEntry[]> = {
  mods: [],
  resourcepacks: [],
  shaderpacks: []
};

interface ProjectContentDrawerProps {
  api: LauncherApi;
  projectId: string;
  projectTitle: string;
  projectSeason: string;
  projectMonogram: string;
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
  projectTitle,
  projectSeason,
  projectMonogram,
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
      <aside
        className={`content-drawer ${open ? 'open' : ''} ${layout}`}
        aria-label={`${projectTitle} content library`}
        aria-hidden={!open}
      >
        <header className="content-drawer-header">
          <span className="content-drawer-monogram" aria-hidden="true">{projectMonogram}</span>
          <span className="content-drawer-title">
            <strong>{projectTitle.toUpperCase()} LIBRARY</strong>
            <small>
              {projectSeason ? `${projectSeason.toUpperCase()} · ` : ''}
              MANAGE PROJECT CONTENT
            </small>
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
              <span>{item.label}</span>
              <small>{loading[item.kind] ? '…' : entries[item.kind].length}</small>
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
            <p><strong>{deleteEntry.name}</strong> will be removed from {projectTitle}. You can restore it from the Recycle Bin.</p>
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
