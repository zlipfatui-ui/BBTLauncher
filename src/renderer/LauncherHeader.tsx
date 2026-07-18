import { useEffect, useRef, useState } from 'react';
import type { LauncherProject, LauncherUpdateState } from '../shared/types';
import { resolveRendererAssetUrl } from './assets';
import { ShoppingBagIcon } from './icons';

export type LauncherTab = 'project' | 'shop' | 'settings';

interface LauncherHeaderProps {
  activeTab: LauncherTab;
  project: LauncherProject;
  updateState: LauncherUpdateState;
  onTabChange(tab: LauncherTab): void;
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
  project,
  updateState,
  onTabChange,
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
            <img
              className="project-trigger-artwork"
              src={resolveRendererAssetUrl(project.artwork.cover)}
              alt=""
              aria-hidden="true"
            />
            <span className="project-trigger-copy">
              <strong>{project.title.toUpperCase()}</strong>
              <small>SEASON 01 · {project.statusText}</small>
            </span>
            <span className="project-trigger-chevron" aria-hidden="true">⌄</span>
          </button>

          {projectMenuOpen ? (
            <div className="project-menu" role="menu" aria-label="Project seasons">
              <button className="project-menu-item current" type="button" role="menuitem" aria-current="page" onClick={() => setProjectMenuOpen(false)}>
                <span className="project-menu-index">01</span>
                <span>
                  <strong>{project.title.toUpperCase()}</strong>
                  <small>SEASON 01 · {project.statusText}</small>
                </span>
              </button>
              <button
                className="project-menu-item coming-soon"
                type="button"
                role="menuitem"
                aria-label="Coming Soon Season 02"
                aria-disabled="true"
                disabled
              >
                <span className="project-menu-index">02</span>
                <span>
                  <strong>COMING SOON</strong>
                  <small>SEASON 02 · COMING SOON</small>
                </span>
              </button>
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
