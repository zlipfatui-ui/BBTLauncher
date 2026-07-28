import { useEffect, useRef, useState } from 'react';
import type { LauncherProject, LauncherUpdateState, ProjectId } from '../shared/types';
import { NORTHVALE_PROJECT_ID } from '../shared/types';
import { resolveRendererAssetUrl } from './assets';
import { ShoppingBagIcon } from './icons';

export type LauncherTab = 'project' | 'shop' | 'settings';

interface LauncherHeaderProps {
  activeTab: LauncherTab;
  projects: LauncherProject[];
  project: LauncherProject;
  updateState: LauncherUpdateState;
  onTabChange(tab: LauncherTab): void;
  onProjectSelect(projectId: ProjectId): void;
  onUpdateAction(): void;
}

const appLogoUrl = resolveRendererAssetUrl('/assets/images/logos/BBT.png');

function updateActionLabel(updateState: LauncherUpdateState): string | null {
  if (updateState.status === 'available') return 'DOWNLOADING UPDATE';
  if (updateState.status === 'downloading') return `${Math.round(updateState.percent || 0)}%`;
  if (updateState.status === 'downloaded') return 'RESTART TO UPDATE';
  return null;
}

export function LauncherHeader({
  activeTab,
  projects,
  project,
  updateState,
  onTabChange,
  onProjectSelect,
  onUpdateAction
}: LauncherHeaderProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const updateLabel = updateActionLabel(updateState);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;

    function closeProjectMenu(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    }

    function closeProjectMenuWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setProjectMenuOpen(false);
    }

    document.addEventListener('pointerdown', closeProjectMenu, true);
    document.addEventListener('keydown', closeProjectMenuWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeProjectMenu, true);
      document.removeEventListener('keydown', closeProjectMenuWithEscape);
    };
  }, [projectMenuOpen]);

  function selectTab(tab: LauncherTab) {
    setProjectMenuOpen(false);
    onTabChange(tab);
  }

  function toggleProjectMenu() {
    if (activeTab !== 'project') {
      setProjectMenuOpen(false);
      onTabChange('project');
      return;
    }

    onTabChange('project');
    setProjectMenuOpen((open) => !open);
  }

  function selectProject(projectId: ProjectId) {
    onTabChange('project');
    onProjectSelect(projectId);
    setProjectMenuOpen(false);
  }

  function projectSubtitle(entry: LauncherProject): string {
    return entry.id === NORTHVALE_PROJECT_ID
      ? `SEASON 01 · ${entry.statusText}`
      : entry.statusText;
  }

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src={appLogoUrl} alt="" aria-hidden="true" data-testid="brand-logo" />
        <div className="brand-name">
          <strong>BeforeBedtime</strong>
          <span>Launcher</span>
        </div>
      </div>

      <nav className="tabs" aria-label="Main tabs">
        <div className="project-picker" ref={pickerRef}>
          <button
            className={`project-trigger tab ${activeTab === 'project' ? 'active' : ''}`}
            type="button"
            aria-label="Project"
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            onClick={toggleProjectMenu}
          >
            {project.artwork.cover ? (
              <img
                className="project-trigger-artwork"
                src={resolveRendererAssetUrl(project.artwork.cover)}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            <span className="project-trigger-copy">
              <strong>{project.title.toUpperCase()}</strong>
              <small>{projectSubtitle(project)}</small>
            </span>
            <span className="project-trigger-chevron" aria-hidden="true">⌄</span>
          </button>

          {projectMenuOpen ? (
            <div className="project-menu" role="menu" aria-label="Projects">
              {projects.map((entry, index) => {
                const current = entry.id === project.id;
                return (
                  <button
                    className={`project-menu-item ${current ? 'current' : ''}`}
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    aria-current={current ? 'page' : undefined}
                    onClick={() => selectProject(entry.id)}
                  >
                    <span className="project-menu-index">{String(index + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>{entry.title.toUpperCase()}</strong>
                      <small>{projectSubtitle(entry)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="topbar-drag-region" aria-hidden="true" />

        <button className={`tab topbar-action ${activeTab === 'shop' ? 'active' : ''}`} type="button" onClick={() => selectTab('shop')}>
          <span className="topbar-action-icon" aria-hidden="true"><ShoppingBagIcon /></span>
          <span>Shop</span>
        </button>
        <button className={`tab topbar-action ${activeTab === 'settings' ? 'active' : ''}`} type="button" onClick={() => selectTab('settings')}>
          <span className="topbar-action-icon settings-mark" aria-hidden="true">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      {updateLabel ? (
        <button
          className="update-button"
          type="button"
          disabled={updateState.status === 'available' || updateState.status === 'downloading'}
          onClick={onUpdateAction}
        >
          {updateLabel}
        </button>
      ) : null}
    </header>
  );
}
