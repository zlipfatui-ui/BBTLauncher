import { useEffect, useState } from 'react';
import type {
  ContentDrawerLayout,
  LaunchProgress,
  LauncherProject,
  ProjectInstallState,
  ProjectLaunchState,
  ProjectProgressEvent
} from '../shared/types';
import type { ProjectStateResult } from '../shared/types';
import { NORTHVALE_PROJECT_ID, SAINAM_PROJECT_ID } from '../shared/types';
import type { LauncherApi } from './launcherApi';
import { resolveRendererAssetUrl } from './assets';
import { FolderIcon } from './icons';
import { ProjectContentDrawer } from './ProjectContentDrawer';

type ProjectActionState = ProjectInstallState | 'checking';

function formatLaunchProgress(progress: LaunchProgress): string {
  const labels: Record<LaunchProgress['phase'], string> = {
    AUTHENTICATING: 'AUTHENTICATING',
    SYNCING: 'SYNCING',
    CHECKING_RUNTIME: 'CHECKING RUNTIME',
    DOWNLOADING_JAVA: 'DOWNLOADING JAVA',
    INSTALLING_MINECRAFT: 'INSTALLING MINECRAFT',
    INSTALLING_FORGE: 'INSTALLING FORGE',
    DOWNLOADING_LIBRARIES: 'DOWNLOADING LIBRARIES',
    LAUNCHING: 'LAUNCHING'
  };
  const label = labels[progress.phase];
  return typeof progress.percent === 'number' ? `${label} ${Math.round(progress.percent)}%` : label;
}

export function ProjectPanel({
  api,
  project
}: {
  api: LauncherApi;
  project: LauncherProject;
}) {
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [projectState, setProjectState] = useState<ProjectActionState>('checking');
  const [projectStateResult, setProjectStateResult] = useState<ProjectStateResult | null>(null);
  const [launchState, setLaunchState] = useState<ProjectLaunchState>({ status: 'idle' });
  const [status, setStatus] = useState('CHECKING');
  const [busy, setBusy] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLayout, setDrawerLayout] = useState<ContentDrawerLayout>('overlay');
  const [contentRevision, setContentRevision] = useState(0);
  const gallery = project.artwork.gallery;
  const visibleDots = Array.from({ length: Math.min(3, gallery.length) }, (_, index) => index);
  const activeImage = gallery.length
    ? resolveRendererAssetUrl(gallery[galleryIndex % gallery.length])
    : null;
  const isNorthvale = project.id === NORTHVALE_PROJECT_ID;
  const repairRequired = project.id === SAINAM_PROJECT_ID
    && projectStateResult?.state === 'update'
    && (projectStateResult.missing > 0 || projectStateResult.changed > 0);

  useEffect(() => {
    if (gallery.length <= 1) return undefined;
    const timer = window.setInterval(() => setGalleryIndex((index) => (index + 1) % gallery.length), 5200);
    return () => window.clearInterval(timer);
  }, [gallery.length]);

  useEffect(
    () => api.project.onProgress((progress: ProjectProgressEvent) => {
      if (progress.projectId !== project.id) return;
      setStatus(formatLaunchProgress(progress));
      setProgressPercent(
        typeof progress.percent === 'number'
          ? Math.max(0, Math.min(100, Math.round(progress.percent)))
          : null
      );
    }),
    [api, project.id]
  );

  useEffect(() => {
    let active = true;
    void api.project.getLaunchState(project.id)
      .then((state) => {
        if (active) setLaunchState(state);
      })
      .catch(() => undefined);
    const dispose = api.project.onLaunchState((state) => {
      if (!state.projectId || state.projectId === project.id || state.status === 'idle') {
        setLaunchState(state);
      }
    });
    return () => {
      active = false;
      dispose();
    };
  }, [api, project.id]);

  useEffect(() => {
    if (launchState.status === 'running') {
      setBusy(false);
      setProgressPercent(null);
      setStatus('RUNNING');
    } else if (launchState.status === 'stopping') {
      setBusy(false);
      setProgressPercent(null);
      setStatus('STOPPING');
    } else if (launchState.status === 'idle' && projectState === 'ready' && (status === 'RUNNING' || status === 'STOPPING')) {
      setBusy(false);
      setProgressPercent(null);
      setStatus(project.statusText);
    }
  }, [launchState.status, project.statusText, projectState, status]);

  useEffect(() => {
    let active = true;
    setProjectState('checking');
    setProjectStateResult(null);
    setStatus('CHECKING');
    setProgressPercent(null);
    void api.project.getState(project.id)
      .then((result) => {
        if (!active) return;
        setProjectState(result.state);
        setProjectStateResult(result);
        setStatus(
          result.state === 'install'
            ? 'NOT INSTALLED'
            : result.state === 'update'
              ? project.id === SAINAM_PROJECT_ID && (result.missing > 0 || result.changed > 0)
                ? 'REPAIR REQUIRED'
                : 'UPDATE !'
              : project.statusText
        );
      })
      .catch(() => {
        if (active) setStatus('FAILED');
      });
    return () => {
      active = false;
    };
  }, [api, project.id, project.statusText]);

  async function runProjectAction() {
    if (launchState.status === 'running') {
      setStatus('STOPPING');
      await api.project.stop(project.id);
      return;
    }
    if (busy || projectState === 'checking' || launchState.status === 'starting' || launchState.status === 'stopping') return;
    if (projectState !== 'ready') {
      setBusy(true);
      setProgressPercent(0);
      setStatus(projectState === 'install' ? 'INSTALLING' : repairRequired ? 'REPAIRING' : 'UPDATING');
      try {
        await api.project.sync(project.id);
        setContentRevision((value) => value + 1);
        setProjectState('ready');
        setProjectStateResult({ state: 'ready', missing: 0, changed: 0, stale: 0 });
        setStatus(project.statusText);
        setProgressPercent(null);
      } catch {
        setStatus('FAILED');
        setProgressPercent(null);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setProgressPercent(null);
    setStatus('AUTHENTICATING');
    const result = await api.project.launch(project.id);
    if (result.ok) {
      if (!result.value.pid) setStatus(project.statusText);
    } else {
      setStatus(result.error.message);
    }
    setProgressPercent(null);
    setBusy(false);
  }

  async function openContentDrawer() {
    setDrawerOpen(true);
    try {
      const nextLayout = await api.window?.setContentDrawerOpen(true);
      setDrawerLayout(nextLayout ?? 'overlay');
    } catch {
      setDrawerLayout('overlay');
    }
  }

  const actionLabel = launchState.status === 'running' || launchState.status === 'stopping'
    ? 'STOP'
    : projectState === 'checking'
      ? 'CHECKING'
      : projectState === 'install'
        ? 'INSTALL'
        : projectState === 'update'
          ? repairRequired ? 'REPAIR' : 'UPDATE'
          : 'PLAY';
  const actionText = busy ? status : actionLabel;
  const actionDisabled = launchState.status === 'stopping'
    || (busy && launchState.status !== 'running')
    || projectState === 'checking'
    || launchState.status === 'starting';

  return (
    <section className={`project-panel ${drawerOpen ? 'content-drawer-open' : ''} ${drawerLayout === 'expanded' ? 'content-drawer-expanded' : 'content-drawer-overlay'}`}>
      <section className="project-board">
        <div className={`project-stage ${activeImage ? '' : 'no-artwork'}`}>
          {activeImage ? (
            <img className="project-image" src={activeImage} alt={`${project.title} gallery image ${galleryIndex + 1}`} />
          ) : null}
          <div className="project-hero-copy">
            <span className="project-eyebrow">
              {isNorthvale ? 'NORTHVALE / SEASON 01' : 'SAINAM / SEASON TEST'}
            </span>
            <h1>{isNorthvale ? 'เริ่มการผจญภัยแห่งนี้' : project.title.toUpperCase()}</h1>
            <p>
              {isNorthvale
                ? 'ความฝันหรือความจริงกันแน่ ?'
                : 'ใบไม้ที่ร่วงโรย แสงแดดอันอบอุ่น และค่ายฤดูใบไม้ร่วงที่ไม่มีใคร…กลับออกมาเหมือนเดิม'}
            </p>
            <div className="project-hero-actions">
              <button className="play-button" type="button" onClick={runProjectAction} disabled={actionDisabled} aria-label={actionText}>
                {progressPercent !== null ? (
                  <span className="play-progress" aria-hidden="true">
                    <span className="play-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </span>
                ) : null}
                <span className="play-content">
                  <span className="play-icon" aria-hidden="true">
                    <svg viewBox="0 0 10 10"><path d="M3 2.2v5.6L7.5 5 3 2.2Z" /></svg>
                  </span>
                  <span className="play-label">{actionText}</span>
                </span>
              </button>
              <button className="manage-content-button" type="button" onClick={openContentDrawer}>
                <span className="manage-content-icon" aria-hidden="true"><FolderIcon /></span>
                <span>MANAGE CONTENT</span>
              </button>
            </div>
          </div>

          {gallery.length ? (
            <div className="project-dots" aria-label="Gallery image count">
              {visibleDots.map((dot) => (
                <button
                  key={dot}
                  className={`project-dot ${dot === galleryIndex % visibleDots.length ? 'active' : ''}`}
                  type="button"
                  aria-label={`Gallery image ${dot + 1}`}
                  onClick={() => setGalleryIndex(dot)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <ProjectContentDrawer
        api={api}
        projectId={project.id}
        projectTitle={project.title}
        projectSeason={isNorthvale ? 'SEASON 01' : ''}
        projectMonogram={isNorthvale ? 'NV' : 'SN'}
        open={drawerOpen}
        layout={drawerLayout}
        refreshKey={contentRevision}
        onOpenChange={setDrawerOpen}
        onLayoutChange={setDrawerLayout}
      />
    </section>
  );
}
