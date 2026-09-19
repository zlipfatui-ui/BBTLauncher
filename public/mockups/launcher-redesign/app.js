/* Browser design prototype only. No Electron bridge or real game operations. */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const storageKey = 'bbt-starlight-design-v1';
const defaultSettings = { memory: 8, resolution: '1280x720', fullscreen: false, stars: true, palette: 'mono', appDirectory: 'C:/Users/zLip/AppData/Roaming/.beforebedtime-launcher' };
let settings = { ...defaultSettings };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved && typeof saved === 'object') {
    if (Number.isFinite(saved.memory) && saved.memory >= 2 && saved.memory <= 16 && Number.isInteger(saved.memory * 16)) settings.memory = saved.memory;
    if (['1280x720', '1366x768', '1600x900', '1920x1080'].includes(saved.resolution)) settings.resolution = saved.resolution;
    if (typeof saved.fullscreen === 'boolean') settings.fullscreen = saved.fullscreen;
    if (typeof saved.stars === 'boolean') settings.stars = saved.stars;
    if (typeof saved.appDirectory === 'string' && saved.appDirectory.trim() && saved.appDirectory.length <= 512) settings.appDirectory = saved.appDirectory.trim();
  }
} catch { /* A denied or damaged local store must not stop the preview. */ }

const projects = {
  sainam: { title: 'SaiNam', season: 'Season Test', tagline: 'สาย-น้ำ', description: 'ใบไม้ที่ร่วงโรย แสงแดดอันอบอุ่น และค่ายฤดูใบไม้ร่วงที่ไม่มีใคร…กลับออกมาเหมือนเดิม', image: './launcher-redesign/sainam-forest.png', alt: 'ภาพวาดป่าและสายน้ำของ SaiNam' },
  northvale: { title: 'Northvale', season: 'Season 01', tagline: 'ความฝันหรือความจริงกันแน่ ?', description: 'เริ่มการผจญภัยแห่งนี้', image: null, alt: '', locked: true }
};
let currentProject = 'sainam';
let currentPanel = null;
let returnFocus = null;
let signedIn = true;
let phase = 'ready';
let progress = 0;
let timer;
let toastTimer;
let launcherUpdateState = 'downloaded';
let launcherUpdatePercent = 0;
let launcherDownloadTimer;
let launcherRestartTimer;
let contentKind = 'mods';
let contentQuery = '';
const sampleContent = {
  mods: [{ name: 'ชุดม็อดของโปรเจกต์', description: 'ดูแลโดย BeforeBedtime', managed: true }, { name: 'ม็อดเสริมของคุณ', description: 'รายการตัวอย่าง · เพิ่มเอง', enabled: true }, { name: 'ม็อดเสริมอีกหนึ่งรายการ', description: 'รายการตัวอย่าง · เพิ่มเอง', enabled: false }],
  resourcepacks: [{ name: 'Resource pack ของโปรเจกต์', description: 'รายการตัวอย่าง · ดูแลโดย BeforeBedtime', managed: true }],
  shaderpacks: []
};

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  window.PreviewMotion.show($('#toast'));
  toastTimer = setTimeout(() => { window.PreviewMotion.hide($('#toast')); }, 4200);
}

function renderStars() {
  if (document.body.classList.contains('entry-page')) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 68; i++) {
    const star = document.createElement('span');
    star.className = `star${i % 3 ? ' dot' : ''}`;
    star.style.cssText = `left:${(i * 43.73 + 5) % 100}%;top:${(i * 29.37 + 3) % 100}%;width:${i % 4 * 3 + 4}px;height:${i % 4 * 3 + 4}px;--opacity:${.18 + i % 5 * .09};--duration:${4 + i % 7}s;--delay:-${i % 9}s`;
    if (i % 3 === 0) star.innerHTML = icon('star');
    fragment.append(star);
  }
  $('#stars').append(fragment);
}

function applyAppearance() {
  document.body.dataset.palette = settings.palette;
  document.body.classList.toggle('stars-paused', !settings.stars);
  $('#stars-toggle').setAttribute('aria-pressed', String(settings.stars));
  if (document.body.dataset.entryRoute === 'main') document.dispatchEvent(new CustomEvent('bbt:star-motion', { detail: settings.stars }));
}

function renderLauncherUpdate() {
  const button = $('#launcher-update-button');
  const downloading = launcherUpdateState === 'downloading';
  const restarting = launcherUpdateState === 'restarting';
  if (launcherUpdateState === 'latest') window.PreviewMotion.hide(button);
  else if (button.hidden || button.inert) window.PreviewMotion.show(button);
  button.disabled = downloading || restarting;
  button.classList.toggle('is-updating', downloading || restarting);
  $('#launcher-update-label').textContent = downloading
    ? `Downloading update · ${launcherUpdatePercent}%`
    : restarting ? 'Restarting…' : 'Restart to update';
  $('#launcher-update-status').textContent = downloading
    ? 'กำลังดาวน์โหลดอัปเดต Launcher'
    : restarting ? 'กำลังจำลองรีสตาร์ต Launcher' : 'อัปเดต Launcher พร้อมแล้ว';
  if (!downloading || launcherUpdatePercent === 0) {
    $('#launcher-update-announcement').textContent = launcherUpdateState === 'latest'
      ? 'Launcher เป็นเวอร์ชันล่าสุดแล้ว'
      : $('#launcher-update-status').textContent;
  }
  const selector = $('#demo-launcher-update');
  if (selector) {
    selector.disabled = restarting;
    selector.value = restarting ? 'downloaded' : launcherUpdateState;
  }
}

function previewLauncherUpdate(nextState) {
  clearInterval(launcherDownloadTimer);
  clearTimeout(launcherRestartTimer);
  launcherUpdateState = nextState;
  launcherUpdatePercent = 0;
  renderLauncherUpdate();
  if (nextState === 'downloading') {
    launcherDownloadTimer = setInterval(() => {
      launcherUpdatePercent = Math.min(100, launcherUpdatePercent + 5);
      if (launcherUpdatePercent === 100) {
        clearInterval(launcherDownloadTimer);
        launcherUpdateState = 'downloaded';
      }
      renderLauncherUpdate();
    }, 240);
  }
}

function restartLauncherPreview() {
  if (launcherUpdateState !== 'downloaded') return;
  launcherUpdateState = 'restarting';
  renderLauncherUpdate();
  launcherRestartTimer = setTimeout(() => {
    const restoreFocus = document.activeElement === $('#launcher-update-button');
    launcherUpdateState = 'latest';
    renderLauncherUpdate();
    if (restoreFocus) $('#stars-toggle').focus();
    toast('จำลองอัปเดต Launcher สำเร็จ · ไม่มีการรีสตาร์ตโปรแกรมจริง');
  }, 1400);
}

function selectProject(id) {
  if (!projects[id] || projects[id].locked || ['preparing', 'downloading', 'running'].includes(phase)) return;
  currentProject = id;
  phase = 'ready';
  const project = projects[id];
  $$('.project-button').forEach(button => {
    const selected = button.dataset.project === id;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#hero-image').hidden = !project.image;
  if (project.image) { $('#hero-image').src = project.image; $('#hero-image').alt = project.alt; }
  $('.world-feature').classList.toggle('without-artwork', !project.image);
  $('#season').textContent = project.season.toUpperCase();
  $('#world-title').textContent = project.title.toUpperCase();
  $('#world-tagline').textContent = project.tagline;
  $('#world-description').textContent = project.description;
  $('#world-info-title').innerHTML = `${project.title} <small>${project.season}</small>`;
  renderLaunch();
}

function renderLaunch() {
  const busy = ['preparing', 'downloading'].includes(phase);
  const states = {
    ready: ['พร้อมออกเดินทาง', 'เข้าเกม', 'LET’S GET LOST', `ไฟล์เกมเป็นเวอร์ชันล่าสุด · RAM ${settings.memory * 1024} MB`],
    install: ['ยังไม่ได้ติดตั้งโปรเจกต์', 'ติดตั้งเกม', 'BEGIN YOUR STORY', 'ติดตั้งไฟล์เกมและม็อดของโปรเจกต์'],
    update: ['มีไฟล์เกมให้อัปเดต', 'อัปเดตเกม', 'A NEW CHAPTER', 'อัปเดตไฟล์ให้ครบก่อนเข้าเล่น'],
    error: ['ดาวน์โหลดไม่สำเร็จ', 'ลองอีกครั้ง', 'TRY AGAIN', 'ตรวจสอบอินเทอร์เน็ต แล้วลองอีกครั้ง'],
    preparing: ['กำลังเตรียมเข้าเกม…', 'กำลังเริ่ม', 'GETTING READY', 'ตรวจสอบไฟล์เกมและ Java'],
    downloading: [`กำลังดาวน์โหลด… ${progress}%`, 'กำลังติดตั้ง', 'PREPARING YOUR WORLD', 'ตัวอย่างความคืบหน้าการดาวน์โหลด'],
    running: ['เกมกำลังทำงาน', 'หยุดเกม', 'SEE YOU SOON', 'สถานะตัวอย่าง · ไม่มีการเปิด Minecraft จริง']
  };
  const state = states[phase];
  $('#install-state').innerHTML = '<span class="status-dot"></span>';
  $('#install-state').append(document.createTextNode(state[0]));
  $('#launch-label').textContent = state[1];
  $('#launch-subtitle').textContent = state[2];
  $('#launch-meta').textContent = state[3];
  $('#launch-button').disabled = busy;
  $('#progress-track').hidden = !busy;
  $('#launch-progress').value = progress;
  $('.launcher').classList.toggle('running', phase === 'running');
  $('.launcher').classList.toggle('launch-error', phase === 'error');
  $$('.project-button').forEach(button => { button.disabled = Boolean(projects[button.dataset.project].locked) || busy || phase === 'running'; });
  if (!busy || progress === 0) $('#launch-announcement').textContent = state[0];
}

function startLaunch() {
  if (projects[currentProject].locked) return;
  if (['preparing', 'downloading'].includes(phase)) return;
  if (phase === 'running') { phase = 'ready'; renderLaunch(); toast('จบการจำลอง · พร้อมเข้าเกมอีกครั้ง'); return; }
  if (!signedIn) { openPanel('account', $('#launch-button')); toast('เข้าสู่ระบบบัญชีตัวอย่างก่อนเข้าเกม'); return; }
  const installing = ['install', 'update', 'error'].includes(phase);
  phase = installing ? 'downloading' : 'preparing';
  progress = 0;
  renderLaunch();
  clearInterval(timer);
  timer = setInterval(() => {
    progress = Math.min(progress + 10, 100);
    if (progress >= 100) {
      clearInterval(timer);
      phase = installing ? 'ready' : 'running';
      toast(installing ? 'จำลองติดตั้งเสร็จแล้ว · กดเข้าเกมเพื่อดูขั้นตอนต่อไป' : 'จำลองเข้าเกมสำเร็จ · กดหยุดเกมเพื่อกลับสู่สถานะพร้อมเล่น');
    }
    renderLaunch();
  }, 320);
}

function setBackgroundInert(value) {
  for (const selector of ['.titlebar', '.sidebar', '.workspace']) $(selector).inert = value;
}

function openPanel(panel, trigger) {
  if (currentPanel) closePanel(false);
  currentPanel = panel;
  returnFocus = trigger || document.activeElement;
  const project = projects[currentProject];
  const titles = { settings: 'ตั้งค่า Launcher', content: 'จัดการคอนเทนต์', shop: 'ร้านค้า', account: 'บัญชีผู้เล่น', details: project.title };
  $('#drawer-title').textContent = titles[panel];
  $('#drawer-subtitle').textContent = panel === 'content' ? `${project.title} · ไฟล์ในโปรเจกต์` : panel === 'settings' ? 'จัดพื้นที่ให้การผจญภัยครั้งต่อไป' : 'BeforeBedtime';
  $('#drawer-body').innerHTML = panelMarkup(panel);
  window.PreviewMotion.show($('#drawer'), 'drawer');
  window.PreviewMotion.show($('#drawer-backdrop'));
  setBackgroundInert(true);
  $('#drawer-close').focus();
  bindPanel(panel);
}

function closePanel(restore = true) {
  window.PreviewMotion.hide($('#drawer'), 'drawer');
  window.PreviewMotion.hide($('#drawer-backdrop'));
  currentPanel = null;
  setBackgroundInert(false);
  if (restore && returnFocus?.isConnected) returnFocus.focus();
}

function panelMarkup(panel) {
  if (panel === 'settings') return `
    <section class="setting-section">
      <div class="directory-heading"><h3 class="section-title">ที่เก็บเกมและ Modpack</h3><button class="directory-change" id="change-directory" aria-expanded="false" aria-controls="directory-editor">${icon('folder')}เปลี่ยน Path</button></div>
      <code class="directory-path" id="directory-current" aria-label="Path ปัจจุบัน"></code>
      <p class="field-help">โฟลเดอร์สำหรับ Modpack, โลก และ Java</p>
      <div class="directory-editor" id="directory-editor" hidden>
        <label class="field-label" for="directory-input">Path ใหม่</label>
        <input class="select-field directory-input" id="directory-input" type="text" maxlength="512" spellcheck="false" autocomplete="off" aria-describedby="directory-help directory-error">
        <p class="field-help" id="directory-help">พรีวิว: พิมพ์ Path เพื่อทดลอง · ใน Launcher จะเปิดหน้าต่างเลือกโฟลเดอร์</p>
        <p class="directory-error" id="directory-error" role="alert" hidden>กรอก Path โฟลเดอร์ก่อนบันทึก</p>
        <div class="directory-actions"><button id="cancel-directory">ยกเลิก</button><button class="directory-apply" id="apply-directory">${icon('check')}ใช้ Path นี้</button></div>
      </div>
    </section>
    <section class="setting-section"><h3 class="section-title">ประสิทธิภาพเกม</h3><label class="field-label" for="memory">หน่วยความจำ (RAM)<output id="memory-value" for="memory">${settings.memory * 1024} MB</output></label><input id="memory" class="memory-slider" type="range" min="2048" max="16384" step="64" value="${settings.memory * 1024}" style="--memory-fill:${(settings.memory - 2) / 14 * 100}%" aria-valuetext="${settings.memory * 1024} MB" aria-describedby="memory-help"><div class="range-ends"><span>2048 MB</span><span>16384 MB</span></div><p class="field-help" id="memory-help">เลือกให้เหมาะกับสเปกเครื่อง และเหลือหน่วยความจำสำหรับโปรแกรมอื่น</p></section>
    <section class="setting-section"><h3 class="section-title">การแสดงผล</h3><label class="field-label" for="resolution">ขนาดหน้าต่าง</label><select id="resolution" class="select-field">${['1280x720','1366x768','1600x900','1920x1080'].map(size => `<option value="${size}" ${size === settings.resolution ? 'selected' : ''}>${size.replace('x',' × ')}</option>`).join('')}</select><label class="switch-row">เต็มหน้าจอ<input id="fullscreen" type="checkbox" ${settings.fullscreen ? 'checked' : ''}></label></section>
    <section class="setting-section"><h3 class="section-title">หน้าตา Launcher</h3><div class="theme-description"><span class="theme-preview" aria-hidden="true"></span><span>ดำ–ขาว</span></div><label class="switch-row">ดาวเคลื่อนไหว<input id="star-motion" type="checkbox" ${settings.stars ? 'checked' : ''}></label></section>
    <button class="panel-button" id="save-settings">${icon('check')}บันทึกค่าพรีวิว</button><p class="field-help">บันทึกเฉพาะเว็บต้นแบบนี้ ไม่เปลี่ยนค่าของ Launcher จริง</p>
    <section class="setting-section"><h3 class="section-title">ลองดูอัปเดต Launcher</h3><label class="sr-only" for="demo-launcher-update">สถานะอัปเดต Launcher จำลอง</label><select id="demo-launcher-update" class="select-field"><option value="downloaded">โหลดเสร็จ · Restart to update</option><option value="downloading">กำลังดาวน์โหลดอัตโนมัติ</option><option value="latest">เป็นเวอร์ชันล่าสุด</option></select><p class="field-help">จำลองอัปเดตตัว Launcher · ปุ่มจะแสดงด้านบนเมื่อมีอัปเดต และกดรีสตาร์ตได้หลังโหลดเสร็จ</p></section>
    <section class="setting-section"><h3 class="section-title">ลองดูสถานะของปุ่มเข้าเกม</h3><label class="sr-only" for="demo-state">สถานะจำลอง</label><select id="demo-state" class="select-field"><option value="ready">พร้อมเล่น</option><option value="install">ยังไม่ได้ติดตั้ง</option><option value="update">มีอัปเดต</option><option value="error">ดาวน์โหลดผิดพลาด</option></select><p class="field-help">เปลี่ยนสถานะเพื่อทดลองหน้าตาและขั้นตอนการทำงาน</p></section>`;
  if (panel === 'content') return `<div class="content-tabs" aria-label="ประเภทคอนเทนต์">${[['mods','Mods'],['resourcepacks','Resource packs'],['shaderpacks','Shaders']].map(([id,name])=>`<button data-content="${id}" aria-pressed="${contentKind === id}">${name}</button>`).join('')}</div><label class="search-field">${icon('search')}<span class="sr-only">ค้นหาคอนเทนต์</span><input id="content-search" placeholder="ค้นหารายการ…" autocomplete="off"></label><p class="content-note">รายการจำลองสำหรับลอง UI · ไฟล์ของโปรเจกต์จะถูกล็อกไว้ ส่วนไฟล์ที่เพิ่มเองเปิดหรือปิดได้</p><div id="content-list"></div><button class="panel-button secondary" id="import-demo">${icon('folder')}ลองเพิ่มรายการตัวอย่าง</button><p class="field-help">ไม่มีการอ่านหรือแก้ไขไฟล์เกมจริง</p>`;
  if (panel === 'shop') return `<div class="quiet-state">${icon('bag')}<h3>ไว้เจอกันที่ร้าน</h3><p>พื้นที่ร้านค้ายังไม่เปิดให้ใช้งาน<br>ระหว่างนี้ ออกเดินทางไปด้วยกันก่อน</p><button class="panel-button" data-close>กลับไปหน้าโปรเจกต์ ${icon('arrow')}</button></div>`;
  if (panel === 'account') return `<div class="account-profile"><span class="avatar">${signedIn ? 'Z' : '?'}</span><h3>${signedIn ? 'Zlevyn' : 'ยินดีต้อนรับ'}</h3><p>${signedIn ? 'บัญชีตัวอย่างสำหรับทดสอบหน้าตา' : 'เข้าสู่ระบบก่อนเริ่มการผจญภัย'}</p></div><button class="panel-button ${signedIn ? 'secondary' : ''}" id="auth-demo">${signedIn ? 'ออกจากระบบตัวอย่าง' : 'จำลองเข้าสู่ระบบ Microsoft'}</button><p class="field-help">ต้นแบบนี้ไม่เชื่อมต่อ Microsoft และไม่ขอข้อมูลบัญชีจริง</p>`;
  const project = projects[currentProject];
  return `${project.image ? `<img class="details-image" src="${project.image}" alt="${project.alt}">` : `<div class="quiet-state">${icon('star')}<p>เว้นพื้นที่สำหรับอาร์ตเวิร์กใหม่<br>ไม่ใช้ภาพเกมชุดเดิม</p></div>`}<p class="details-copy">${project.description}</p><div class="detail-row"><span>โปรเจกต์</span><strong>${project.title}</strong></div><div class="detail-row"><span>ซีซัน</span><strong>${project.season}</strong></div><div class="detail-row"><span>Minecraft</span><strong>1.20.1</strong></div><div class="detail-row"><span>Forge</span><strong>47.4.20</strong></div><div class="detail-row"><span>Java</span><strong>17</strong></div><button class="panel-button" data-close>กลับไปเตรียมเข้าเกม ${icon('arrow')}</button>`;
}

function bindPanel(panel) {
  $$('#drawer [data-close]').forEach(button => button.addEventListener('click', () => closePanel()));
  if (panel === 'settings') {
    let draftDirectory = settings.appDirectory;
    const directoryInput = $('#directory-input');
    const directoryEditor = $('#directory-editor');
    const directoryButton = $('#change-directory');
    $('#directory-current').textContent = draftDirectory;
    function closeDirectoryEditor() {
      window.PreviewMotion.expand(directoryEditor, false);
      directoryButton.setAttribute('aria-expanded', 'false');
      directoryButton.focus();
    }
    function applyDirectory() {
      const value = directoryInput.value.trim();
      if (!value) {
        $('#directory-error').hidden = false;
        directoryInput.setAttribute('aria-invalid', 'true');
        directoryInput.focus();
        return false;
      }
      draftDirectory = value;
      $('#directory-current').textContent = value;
      closeDirectoryEditor();
      return true;
    }
    directoryButton.addEventListener('click', () => {
      if (directoryButton.getAttribute('aria-expanded') === 'true') { closeDirectoryEditor(); return; }
      directoryInput.value = draftDirectory;
      directoryInput.removeAttribute('aria-invalid');
      $('#directory-error').hidden = true;
      window.PreviewMotion.expand(directoryEditor, true);
      directoryButton.setAttribute('aria-expanded', 'true');
      directoryInput.focus();
      directoryInput.select();
    });
    directoryInput.addEventListener('input', () => {
      directoryInput.removeAttribute('aria-invalid');
      $('#directory-error').hidden = true;
    });
    directoryInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); applyDirectory(); }
    });
    directoryEditor.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); closeDirectoryEditor(); }
    });
    $('#apply-directory').addEventListener('click', applyDirectory);
    $('#cancel-directory').addEventListener('click', closeDirectoryEditor);
    $('#memory').addEventListener('input', event => {
      const value = Number(event.target.value);
      const label = `${value} MB`;
      $('#memory-value').textContent = label;
      event.target.setAttribute('aria-valuetext', label);
      event.target.style.setProperty('--memory-fill', `${(value - 2048) / (16384 - 2048) * 100}%`);
    });
    $('#star-motion').addEventListener('change', event => { settings.stars = event.target.checked; applyAppearance(); });
    renderLauncherUpdate();
    $('#demo-launcher-update').addEventListener('change', event => {
      previewLauncherUpdate(event.target.value);
      closePanel();
    });
    $('#save-settings').addEventListener('click', () => {
      if (!directoryEditor.hidden && !applyDirectory()) return;
      settings.appDirectory = draftDirectory;
      settings.memory = Number($('#memory').value) / 1024;
      settings.resolution = $('#resolution').value;
      settings.fullscreen = $('#fullscreen').checked;
      let stored = true;
      try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { stored = false; }
      renderLaunch();
      toast(stored ? 'บันทึกค่าพรีวิวแล้ว' : 'ใช้ค่าแล้วในหน้านี้ · เบราว์เซอร์ไม่อนุญาตให้บันทึกถาวร');
    });
    $('#demo-state').value = ['ready','install','update','error'].includes(phase) ? phase : 'ready';
    $('#demo-state').addEventListener('change', event => {
      clearInterval(timer);
      phase = event.target.value;
      progress = 0;
      renderLaunch();
      closePanel();
      toast('เปลี่ยนเป็นสถานะตัวอย่างแล้ว');
    });
  }
  if (panel === 'content') {
    contentQuery = '';
    renderContent();
    $$('#drawer [data-content]').forEach(button => button.addEventListener('click', () => {
      contentKind = button.dataset.content;
      $$('#drawer [data-content]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
      renderContent();
      window.PreviewMotion.animate($('#content-list'), [{ opacity: .35, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 280 });
    }));
    $('#content-search').addEventListener('input', event => { contentQuery = event.target.value; renderContent(); });
    $('#import-demo').addEventListener('click', () => {
      const names = { mods: 'ม็อด', resourcepacks: 'Resource pack', shaderpacks: 'Shader' };
      sampleContent[contentKind].push({ name: `${names[contentKind]} ตัวอย่าง ${sampleContent[contentKind].length + 1}`, description: 'รายการจำลอง · เพิ่มเอง', enabled: true });
      contentQuery = '';
      $('#content-search').value = '';
      renderContent();
      toast('เพิ่มรายการตัวอย่างแล้ว');
    });
  }
  if (panel === 'account') $('#auth-demo').addEventListener('click', () => {
    if (['running','preparing','downloading'].includes(phase)) { toast('หยุดการจำลองเกมก่อนออกจากระบบ'); return; }
    signedIn = !signedIn;
    try {
      if (signedIn) sessionStorage.setItem('bbt-preview-account', 'signed-in');
      else sessionStorage.removeItem('bbt-preview-account');
    } catch { /* Session storage is optional for the browser preview. */ }
    $('#account-name').textContent = signedIn ? 'Zlevyn' : 'เข้าสู่ระบบ';
    $('#account-subtitle').textContent = signedIn ? 'บัญชีตัวอย่าง' : 'Microsoft account';
    $('.account .avatar').textContent = signedIn ? 'Z' : '?';
    closePanel();
    toast(signedIn ? 'เข้าสู่ระบบตัวอย่างแล้ว' : 'ออกจากระบบตัวอย่างแล้ว');
  });
}

function renderContent() {
  const visible = sampleContent[contentKind].map((item, index) => ({ ...item, index })).filter(item => item.name.toLowerCase().includes(contentQuery.toLowerCase()));
  $('#content-list').innerHTML = visible.length ? visible.map(item => `<div class="content-item"><span class="content-item-icon">${icon('folder')}</span><span><strong>${item.name}</strong><small>${item.description}</small></span>${item.managed ? '<svg aria-label="ไฟล์ที่โปรเจกต์ดูแล"><use href="#lock"/></svg>' : `<input type="checkbox" aria-label="เปิดใช้ ${item.name}" data-item="${item.index}" ${item.enabled ? 'checked' : ''}>`}</div>`).join('') : `<div class="content-empty">${contentQuery ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการในหมวดนี้'}<p class="field-help">${contentQuery ? 'ลองใช้คำค้นอื่น' : 'กดปุ่มด้านล่างเพื่อลองเพิ่มรายการ'}</p></div>`;
  $$('#content-list input').forEach(input => input.addEventListener('change', () => {
    sampleContent[contentKind][Number(input.dataset.item)].enabled = input.checked;
    toast(input.checked ? 'เปิดใช้งานรายการตัวอย่างแล้ว' : 'ปิดใช้งานรายการตัวอย่างแล้ว');
  }));
}

$$('[data-project]').forEach(button => button.addEventListener('click', () => selectProject(button.dataset.project)));
$$('[data-panel]').forEach(button => button.addEventListener('click', () => openPanel(button.dataset.panel, button)));
$('#launch-button').addEventListener('click', startLaunch);
$('#launcher-update-button').addEventListener('click', restartLauncherPreview);
$('#drawer-close').addEventListener('click', () => closePanel());
$('#drawer-backdrop').addEventListener('click', () => closePanel());
$('.brand').addEventListener('click', event => { event.preventDefault(); closePanel(false); selectProject('sainam'); });
$('#stars-toggle').addEventListener('click', () => { settings.stars = !settings.stars; applyAppearance(); toast(settings.stars ? 'เปิดดาวเคลื่อนไหวแล้ว' : 'หยุดดาวเคลื่อนไหวแล้ว'); });
$$('[data-window]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.window === 'maximize') {
    document.body.classList.toggle('expanded-preview');
    toast('ต้นแบบปรับขนาดตามหน้าต่างเบราว์เซอร์ · ใน Electron ใช้ปุ่มขยายหน้าต่างจริงได้');
  } else toast('ปุ่มหน้าต่างตัวอย่าง · ใช้งานจริงเมื่ออยู่ใน Electron');
}));
document.addEventListener('keydown', event => {
  if (!currentPanel) return;
  if (event.key === 'Escape') { closePanel(); return; }
  if (event.key === 'Tab') {
    const focusable = $$('#drawer button, #drawer input, #drawer select, #drawer a').filter(element => !element.disabled && element.offsetParent !== null);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
$('#hero-image').addEventListener('error', () => { $('#hero-image').hidden = true; $('.world-feature').classList.add('without-artwork'); });
renderStars();
applyAppearance();
selectProject('sainam');
renderLauncherUpdate();
document.addEventListener('bbt:main-enter', () => {
  signedIn = true;
  $('#account-name').textContent = 'Zlevyn';
  $('#account-subtitle').textContent = 'บัญชีตัวอย่าง';
  $('.account .avatar').textContent = 'Z';
  applyAppearance();
});
document.addEventListener('bbt:main-leave', () => {
  if (currentPanel) closePanel(false);
  if ($('#screenshot-viewer')?.open) $('#screenshot-viewer').close();
});
