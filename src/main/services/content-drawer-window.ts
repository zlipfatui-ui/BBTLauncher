import { BrowserWindow, screen, type Rectangle } from 'electron';
import type { ContentDrawerLayout } from '../../shared/types.js';

const drawerWidth = 340;

interface DrawerWindowState {
  open: boolean;
  layout: ContentDrawerLayout;
  expanded: boolean;
  pendingRestore: boolean;
  restoreBounds?: Rectangle;
}
function createState(): DrawerWindowState {
  return {
    open: false,
    layout: 'overlay',
    expanded: false,
    pendingRestore: false
  };
}

export function createContentDrawerWindowController() {
  const states = new WeakMap<BrowserWindow, DrawerWindowState>();

  function stateFor(win: BrowserWindow): DrawerWindowState {
    const existing = states.get(win);
    if (existing) return existing;
    const next = createState();
    states.set(win, next);
    return next;
  }

  function notify(win: BrowserWindow, layout: ContentDrawerLayout): void {
    if (!win.isDestroyed()) win.webContents.send('window:contentDrawerLayout', layout);
  }

  function useOverlay(win: BrowserWindow, state: DrawerWindowState): ContentDrawerLayout {
    state.layout = 'overlay';
    state.expanded = false;
    notify(win, state.layout);
    return state.layout;
  }

  function applyOpenLayout(win: BrowserWindow, state: DrawerWindowState): ContentDrawerLayout {
    if (win.isMaximized() || win.isFullScreen()) return useOverlay(win, state);

    const baseBounds = state.restoreBounds ?? win.getBounds();
    state.restoreBounds = baseBounds;
    const workArea = screen.getDisplayMatching(baseBounds).workArea;
    const targetWidth = baseBounds.width + drawerWidth;
    if (targetWidth > workArea.width) return useOverlay(win, state);

    const rightEdge = workArea.x + workArea.width;
    const targetX = Math.max(workArea.x, Math.min(baseBounds.x, rightEdge - targetWidth));
    win.setBounds({ ...baseBounds, x: targetX, width: targetWidth }, true);
    state.layout = 'expanded';
    state.expanded = true;
    state.pendingRestore = false;
    notify(win, state.layout);
    return state.layout;
  }

  function restoreWindowedBounds(win: BrowserWindow, state: DrawerWindowState): void {
    if (state.restoreBounds) win.setBounds(state.restoreBounds, true);
    state.expanded = false;
    state.pendingRestore = false;
    state.restoreBounds = undefined;
  }

  function setOpen(win: BrowserWindow, open: boolean): ContentDrawerLayout {
    const state = stateFor(win);
    if (state.open === open) return state.layout;
    state.open = open;

    if (open) {
      if (!win.isMaximized() && !win.isFullScreen()) state.restoreBounds = win.getBounds();
      return applyOpenLayout(win, state);
    }

    if (state.restoreBounds && (win.isMaximized() || win.isFullScreen())) {
      state.pendingRestore = true;
    } else {
      restoreWindowedBounds(win, state);
    }
    state.layout = 'overlay';
    notify(win, state.layout);
    return state.layout;
  }

  function afterReturnToWindowed(win: BrowserWindow): void {
    const state = stateFor(win);
    setTimeout(() => {
      if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
      if (state.restoreBounds) win.setBounds(state.restoreBounds, false);
      if (state.open) {
        applyOpenLayout(win, state);
      } else if (state.pendingRestore || state.restoreBounds) {
        restoreWindowedBounds(win, state);
        notify(win, 'overlay');
      }
    }, 0);
  }

  function attach(win: BrowserWindow): void {
    stateFor(win);
    win.on('maximize', () => {
      const state = stateFor(win);
      if (state.open) useOverlay(win, state);
    });
    win.on('enter-full-screen', () => {
      const state = stateFor(win);
      if (state.open) useOverlay(win, state);
    });
    win.on('unmaximize', () => afterReturnToWindowed(win));
    win.on('leave-full-screen', () => afterReturnToWindowed(win));
    win.once('closed', () => states.delete(win));
  }

  return { attach, setOpen };
}
