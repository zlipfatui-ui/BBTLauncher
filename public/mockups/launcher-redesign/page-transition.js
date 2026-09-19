/* Shared, interruptible motion. Animate live elements, never frozen page snapshots. */
(() => {
  const running = new WeakMap();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.16,1,.3,1)';
  function animate(element, frames, options = {}) {
    running.get(element)?.cancel();
    const animation = element.animate(frames, { duration: 360, easing: ease, fill: 'both', ...options, ...(reduced.matches ? { duration: 0, delay: 0 } : {}) });
    running.set(element, animation);
    return animation.finished.then(() => {
      if (running.get(element) !== animation) return false;
      animation.cancel();
      running.delete(element);
      return true;
    }, () => false);
  }
  function show(element, kind = 'fade') {
    const wasHidden = element.hidden;
    const before = getComputedStyle(element);
    const from = { opacity: wasHidden ? 0 : before.opacity };
    const to = { opacity: 1 };
    if (kind === 'drawer') { from.transform = wasHidden ? 'translateX(32px)' : before.transform; to.transform = 'none'; }
    element.hidden = false;
    element.inert = false;
    return animate(element, [from, to], { duration: kind === 'drawer' ? 420 : 260 });
  }
  async function hide(element, kind = 'fade') {
    if (element.hidden) return;
    const before = getComputedStyle(element);
    element.inert = true;
    const from = { opacity: before.opacity };
    const to = { opacity: 0 };
    if (kind === 'drawer') { from.transform = before.transform; to.transform = 'translateX(24px)'; }
    const finished = await animate(element, [from, to], { duration: 220 });
    if (finished) { element.hidden = true; element.inert = false; }
  }
  async function expand(element, open) {
    const before = getComputedStyle(element);
    const from = element.hidden ? { height: '0px', marginTop: '0px', paddingTop: '0px', borderTopWidth: '0px', opacity: 0 } : { height: `${element.getBoundingClientRect().height}px`, marginTop: before.marginTop, paddingTop: before.paddingTop, borderTopWidth: before.borderTopWidth, opacity: before.opacity };
    running.get(element)?.cancel();
    element.hidden = false;
    element.inert = !open;
    const natural = getComputedStyle(element);
    const to = open ? { height: `${element.getBoundingClientRect().height}px`, marginTop: natural.marginTop, paddingTop: natural.paddingTop, borderTopWidth: natural.borderTopWidth, opacity: 1 } : { height: '0px', marginTop: '0px', paddingTop: '0px', borderTopWidth: '0px', opacity: 0 };
    if (await animate(element, [from, to], { duration: 320 })) { element.hidden = !open; element.inert = false; }
  }
  window.PreviewMotion = { animate, show, hide, expand, reduced, ease };
})();
