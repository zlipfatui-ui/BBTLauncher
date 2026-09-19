/* Click-to-start and Microsoft sign-in design preview. No authentication requests. */
(() => {
  const get = selector => document.querySelector(selector);
  const signIn = get('#microsoft-login');
  const consent = get('#preview-terms');
  let authTimer;
  let navigateTimer;
  let toastTimer;
  let state = 'idle';
  let activeRoute = null;
  let routeRevision = 0;
  let routeAnimations = [];
  let leaving = false;
  let mainActive = false;
  let mainElement;
  let navigationRevision = 0;
  let backgroundEnabled = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const welcome = get('#welcome-screen');
  const loginScreen = get('#login-screen');
  const accountKey = 'bbt-preview-account';
  function hasPreviewAccount() {
    try { return sessionStorage.getItem(accountKey) === 'signed-in'; } catch { return false; }
  }
  function updateStartDestination() {
    const signedIn = hasPreviewAccount();
    get('#click-to-start').href = signedIn ? '#launcher' : '#login';
    get('#start-switch-account').hidden = !signedIn;
  }

  const stars = document.createDocumentFragment();
  for (let i = 0; i < 100; i++) {
    const star = document.createElement('span');
    const spark = i % 3 === 0;
    const near = i % 3 === 0;
    const size = spark ? 8 + i % 5 * 2.5 : i % 2 ? 1.5 : 2.2;
    const travelTime = spark ? 18 + i % 9 : 30 + i % 13;
    star.className = `entry-particle ${spark ? 'is-spark' : near ? 'is-near' : 'is-far'}`;
    star.style.cssText = `left:${(i * 43.73 + 5) % 100}%;top:110%;width:${size}px;height:${size}px;--static-top:${(i * 29.37 + 3) % 100}%;--travel-x:${near ? 45 : -22}px;--travel-time:${travelTime}s;--travel-delay:-${(i * 7.13) % travelTime}s;--shimmer-time:${3 + i % 6}s;--shimmer-delay:-${i % 8}s;--star-dim:${near ? .34 : .2};--star-bright:${spark ? .8 : .52}`;
    star.innerHTML = spark ? '<i><svg><use href="#star"/></svg></i>' : '<i></i>';
    stars.append(star);
  }
  get('#entry-stars').append(stars);

  function updateMotion() {
    const enabled = backgroundEnabled && !reducedMotion.matches;
    document.body.classList.toggle('entry-background-paused', !enabled || document.hidden);
    const toggle = get('#entry-motion-toggle');
    toggle.disabled = reducedMotion.matches;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', reducedMotion.matches ? 'ลดการเคลื่อนไหวตามการตั้งค่าระบบ' : enabled ? 'หยุดฉากหลังเคลื่อนไหว' : 'เปิดฉากหลังเคลื่อนไหว');
    toggle.querySelector('span').textContent = reducedMotion.matches ? 'ลดการเคลื่อนไหว' : enabled ? 'หยุดดาว' : 'เปิดดาว';
  }
  get('#entry-motion-toggle').addEventListener('click', () => { backgroundEnabled = !backgroundEnabled; updateMotion(); });
  document.addEventListener('visibilitychange', updateMotion);
  reducedMotion.addEventListener('change', () => { updateMotion(); renderRoute(false, false); });
  updateMotion();

  function updateButton() {
    const busy = state === 'pending' || state === 'success';
    signIn.disabled = !consent.checked || busy;
    consent.disabled = busy;
    get('#login-demo-result').disabled = busy;
    signIn.classList.toggle('is-busy', state === 'pending');
    signIn.classList.toggle('is-success', state === 'success');
    get('#login-button-label').textContent = state === 'pending' ? 'กำลังเข้าสู่ระบบ…' : state === 'success' ? 'พร้อมแล้ว ไปกันเลย' : state === 'error' ? 'ลองเข้าสู่ระบบอีกครั้ง' : 'Login with Microsoft';
    get('#login-button-icon use').setAttribute('href', state === 'success' ? '#check' : '#microsoft');
    get('#login-cancel').hidden = state !== 'pending';
  }

  function resetAuth() {
    navigationRevision++;
    leaving = false;
    clearTimeout(authTimer);
    clearTimeout(navigateTimer);
    state = 'idle';
    get('#login-feedback').hidden = true;
    get('#login-feedback-icon').classList.remove('is-loading');
    updateButton();
  }

  function status(title, description, loading = false) {
    get('#login-status-title').textContent = title;
    get('#login-status-description').textContent = description;
    get('#login-feedback-icon').classList.toggle('is-loading', loading);
    get('#login-feedback-icon').innerHTML = loading ? '' : '<svg><use href="#star"/></svg>';
    get('#login-feedback').hidden = false;
  }

  function renderRoute(moveFocus = true, animate = true) {
    if (location.hash === '#launcher') { enterLauncher(false); return; }
    const wasMain = mainActive;
    mainActive = false;
    resetAuth();
    updateStartDestination();
    const login = location.hash === '#login';
    const nextRoute = login ? 'login' : 'start';
    const next = login ? loginScreen : welcome;
    const previous = activeRoute === 'login' ? loginScreen : activeRoute === 'start' ? welcome : null;
    if (previous === next && animate && !wasMain) return;
    // Measure the visible, possibly moving brand before interrupting a transition.
    const from = previous?.querySelector('.entry-wordmark').getBoundingClientRect();
    const revision = ++routeRevision;
    routeAnimations.forEach(animation => animation.cancel());
    routeAnimations = [];
    for (const screen of [welcome, loginScreen]) screen.querySelector('.entry-wordmark').style.visibility = '';
    activeRoute = nextRoute;
    next.hidden = false;
    next.inert = false;
    const other = login ? welcome : loginScreen;
    other.inert = true;
    document.body.dataset.entryRoute = nextRoute;
    document.title = `BeforeBedtime — ${login ? 'Login Microsoft' : 'Click to start'}`;
    if (wasMain) {
      document.dispatchEvent(new Event('bbt:main-leave'));
      mainElement.inert = true;
      window.PreviewMotion.hide(mainElement);
      window.PreviewMotion.show(get('.entry-main'));
      window.PreviewMotion.show(get('.entry-footer'));
    }
    get('.entry-main').scrollTop = 0;
    if (moveFocus) (login ? get('#login-title') : get('#click-to-start')).focus({ preventScroll: true });
    if (!animate || !previous || previous === next || reducedMotion.matches || wasMain) {
      other.hidden = true;
      return;
    }
    const incomingBrand = next.querySelector('.entry-wordmark');
    const to = incomingBrand.getBoundingClientRect();
    previous.querySelector('.entry-wordmark').style.visibility = 'hidden';
    const easing = 'cubic-bezier(.16,1,.3,1)';
    function motion(element, frames, duration, delay = 0) {
      routeAnimations.push(element.animate(frames, { duration, delay, easing, fill: 'both' }));
    }
    incomingBrand.style.transformOrigin = '0 0';
    motion(incomingBrand, [
      { transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})` },
      { transform: 'translate(0,0) scale(1,1)' }
    ], 680);
    const oldParts = previous.querySelectorAll(login ? '.welcome-family,.start-button,.start-switch-account,.welcome-signature' : '.login-content,.login-brand>p,.entry-back');
    oldParts.forEach(element => motion(element, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-12px)' }], 200));
    const newParts = next.querySelectorAll(login ? '.login-content,.login-brand>p,.entry-back' : '.welcome-family,.start-button,.start-switch-account,.welcome-signature');
    newParts.forEach((element, index) => motion(element, [{ opacity: 0, transform: `translate(${login && index === 2 ? 20 : 0}px,12px)` }, { opacity: 1, transform: 'translate(0,0)' }], 480, 100 + index * 35));
    const animations = [...routeAnimations];
    Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (revision !== routeRevision) return;
      other.hidden = true;
      other.querySelector('.entry-wordmark').style.visibility = '';
      animations.forEach(animation => animation.cancel());
      routeAnimations = [];
    });
  }

  async function enterLauncher(pushHistory = true) {
    if (leaving || mainActive) return;
    leaving = true;
    if (activeRoute === null && location.hash === '#launcher') {
      get('.entry-main').hidden = true;
      get('.entry-footer').hidden = true;
    }
    const revision = navigationRevision;
    try {
      mainElement = await window.LauncherMainView.prepare();
    } catch {
      leaving = false;
      get('#entry-toast').textContent = 'โหลดหน้าพรีวิวไม่ได้ ลองรีโหลดหน้าแล้วกดอีกครั้ง';
      get('#entry-toast').hidden = false;
      return;
    }
    if (revision !== navigationRevision) return;
    if (pushHistory) history.pushState(null, '', '#launcher');
    mainActive = true;
    document.body.dataset.entryRoute = 'main';
    document.title = 'BeforeBedtime — Starlight Launcher';
    const motion = window.PreviewMotion;
    const mainWasHidden = mainElement.hidden;
    motion.show(mainElement);
    motion.hide(get('.entry-main'));
    motion.hide(get('.entry-footer'));
    if (mainWasHidden) {
      motion.animate(mainElement.querySelector('.sidebar'), [{ opacity: 0, transform: 'translateX(-18px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 680 });
      motion.animate(mainElement.querySelector('.workspace'), [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 680, delay: 70 });
    }
    document.dispatchEvent(new Event('bbt:main-enter'));
    mainElement.querySelector('.page-heading h1').setAttribute('tabindex', '-1');
    mainElement.querySelector('.page-heading h1').focus({ preventScroll: true });
    leaving = false;
  }

  get('#click-to-start').addEventListener('click', event => {
    if (!hasPreviewAccount() || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enterLauncher();
  });

  get('.entry-main-preview').addEventListener('click', event => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enterLauncher();
  });
  get('.entry-main-preview').href = '#launcher';
  document.addEventListener('bbt:star-motion', event => { backgroundEnabled = event.detail; updateMotion(); });

  consent.addEventListener('change', () => {
    if (state === 'error') resetAuth();
    updateButton();
  });
  get('#login-demo-result').addEventListener('change', resetAuth);
  signIn.addEventListener('click', () => {
    if (!consent.checked || state === 'pending' || state === 'success') return;
    state = 'pending';
    updateButton();
    status('กำลังเข้าสู่ระบบตัวอย่าง', 'รอสักครู่ กำลังเตรียมบัญชีสำหรับพรีวิว', true);
    authTimer = setTimeout(() => {
      if (get('#login-demo-result').value === 'error') {
        state = 'error';
        status('เชื่อมต่อไม่สำเร็จ', 'สถานะตัวอย่าง: ลองใหม่ หรือเปลี่ยนผลพรีวิวเป็น “เข้าสู่ระบบสำเร็จ”');
        updateButton();
        signIn.focus();
        return;
      }
      state = 'success';
      try { sessionStorage.setItem(accountKey, 'signed-in'); } catch { /* Account persistence is optional in this demo. */ }
      status('ยินดีต้อนรับ Zlevyn', 'บัญชีตัวอย่างพร้อมแล้ว กำลังเปิด Launcher');
      get('#login-feedback-icon').innerHTML = '<svg><use href="#check"/></svg>';
      updateButton();
      navigateTimer = setTimeout(enterLauncher, 650);
    }, 1300);
  });
  get('#login-cancel').addEventListener('click', () => {
    resetAuth();
    status('ยกเลิกการเข้าสู่ระบบแล้ว', 'กด Login with Microsoft เพื่อทดลองอีกครั้ง');
    signIn.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && location.hash === '#login') {
      if (state === 'pending') get('#login-cancel').click();
      else location.hash = 'start';
    }
  });
  document.querySelectorAll('[data-entry-window]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.entryWindow === 'maximize') document.body.classList.toggle('expanded-preview');
    clearTimeout(toastTimer);
    get('#entry-toast').textContent = button.dataset.entryWindow === 'maximize' ? 'ปรับพื้นที่พรีวิวแล้ว' : 'ปุ่มหน้าต่างตัวอย่าง · ใช้งานจริงใน Launcher';
    get('#entry-toast').hidden = false;
    toastTimer = setTimeout(() => { get('#entry-toast').hidden = true; }, 2800);
  }));
  window.addEventListener('hashchange', () => renderRoute());
  window.addEventListener('pagehide', () => { clearTimeout(authTimer); clearTimeout(navigateTimer); });
  // History can restore checkbox state after script initialization or pageshow.
  window.addEventListener('pageshow', event => requestAnimationFrame(() => {
    updateMotion();
    updateStartDestination();
    updateButton();
    if (event.persisted) { leaving = false; renderRoute(false, false); }
  }));
  renderRoute(false, false);
  // Warm the DOM, fonts and decoded artwork before the first click.
  window.LauncherMainView.prepare().catch(() => {});
})();
