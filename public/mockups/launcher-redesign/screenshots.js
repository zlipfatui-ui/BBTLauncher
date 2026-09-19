/* Local browser preview only. Image files stay in this browser tab. */
(() => {
  const find = selector => document.querySelector(selector);
  const viewer = find('#screenshot-viewer');
  const fileInput = find('#screenshot-file-input');
  const fullImage = find('#screenshot-full');
  let photos = [{ name: 'sainam-forest.png', url: './launcher-redesign/sainam-forest.png', sample: true }];
  let selected = 0;
  let importVersion = 0;
  let opener;

  function report(message) {
    if (viewer.open) {
      find('#screenshot-feedback').textContent = message;
      find('#screenshot-feedback').hidden = false;
    } else toast(message);
  }

  function thumbnail(photo, index) {
    const button = document.createElement('button');
    button.className = 'screenshot-thumb';
    button.title = photo.name;
    button.setAttribute('aria-label', `ดูรูป ${photo.name}`);
    button.setAttribute('aria-pressed', String(index === selected));
    const image = document.createElement('img');
    image.src = photo.url;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.hidden = true; button.classList.add('image-unavailable'); });
    button.append(image);
    button.addEventListener('click', () => showPhoto(index));
    return button;
  }

  function renderLibrary() {
    find('#screenshots-summary').textContent = photos[0].sample
      ? 'ตัวอย่างพรีวิว' : `${photos.length} รูป`;
    find('#screenshot-entry-image').src = photos[0].url;
    find('#screenshot-filmstrip').replaceChildren(...photos.map((photo, index) => thumbnail(photo, index)));
  }

  function showPhoto(index) {
    selected = Math.max(0, Math.min(index, photos.length - 1));
    const photo = photos[selected];
    fullImage.hidden = false;
    find('#screenshot-load-error').hidden = true;
    find('#screenshot-feedback').hidden = true;
    fullImage.alt = photo.sample ? 'ภาพวาดป่า SaiNam สำหรับลองพรีวิว' : photo.name;
    fullImage.src = photo.url;
    find('#screenshot-count').textContent = `${selected + 1} / ${photos.length} รูป`;
    find('#screenshot-filename').textContent = photo.name;
    find('#screenshot-file-details').textContent = photo.sample ? 'ภาพตัวอย่าง · ไม่ใช่รูปที่ถ่ายจากเกม' : `ไฟล์ในเครื่อง · ${(photo.size / 1024 / 1024).toFixed(2)} MB`;
    find('#screenshot-open-file').href = photo.url;
    find('#screenshot-sample-tag').hidden = !photo.sample;
    find('#screenshot-previous').disabled = selected === 0;
    find('#screenshot-next').disabled = selected === photos.length - 1;
    find('#screenshot-preview-note').textContent = photo.sample
      ? 'ภาพตัวอย่างสำหรับลอง UI · ยังไม่ได้อ่านโฟลเดอร์เกม'
      : 'รูปที่เลือกใช้เฉพาะพรีวิวนี้ · ไม่มีการอัปโหลด · รีโหลดหน้าแล้วรูปจะหาย';
    [...find('#screenshot-filmstrip').children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === selected)));
  }

  function openViewer(index, trigger) {
    opener = trigger;
    showPhoto(index);
    viewer.showModal();
    viewer.classList.remove('is-closing');
    window.PreviewMotion.animate(viewer, [{ opacity: 0, transform: 'translateY(10px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
  }

  async function closeViewer() {
    if (viewer.classList.contains('is-closing')) return;
    viewer.classList.add('is-closing');
    const current = getComputedStyle(viewer);
    const finished = await window.PreviewMotion.animate(viewer, [{ opacity: current.opacity, transform: current.transform }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], { duration: 220 });
    if (finished) viewer.close();
    viewer.classList.remove('is-closing');
  }

  fullImage.addEventListener('load', () => {
    const photo = photos[selected];
    find('#screenshot-file-details').textContent = `${fullImage.naturalWidth} × ${fullImage.naturalHeight} · ${photo.sample ? 'ภาพตัวอย่าง UI' : `${(photo.size / 1024 / 1024).toFixed(2)} MB`}`;
  });
  fullImage.addEventListener('error', () => {
    fullImage.hidden = true;
    find('#screenshot-load-error').hidden = false;
  });
  find('#screenshot-close').addEventListener('click', closeViewer);
  viewer.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
  viewer.addEventListener('close', () => {
    const fallback = find('[data-open-screenshots]');
    (opener?.isConnected ? opener : fallback).focus();
  });
  find('#screenshot-previous').addEventListener('click', () => showPhoto(selected - 1));
  find('#screenshot-next').addEventListener('click', () => showPhoto(selected + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(selected + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  document.querySelectorAll('[data-open-screenshots]').forEach(button => button.addEventListener('click', () => openViewer(selected, button)));
  find('#screenshot-reveal').addEventListener('click', () => report(`พรีวิว: ใน Launcher จะเปิดโฟลเดอร์และเลือกไฟล์ “${photos[selected].name}” ให้`));
  document.querySelectorAll('[data-import-screenshots]').forEach(button => button.addEventListener('click', () => fileInput.click()));

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    if (!files.length) return;
    const version = ++importVersion;
    const candidates = files.filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size <= 20 * 1024 * 1024).slice(0, 30);
    const checked = await Promise.all(candidates.map(file => new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ name: file.name, size: file.size, modified: file.lastModified, url, sample: false });
      image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      image.src = url;
    })));
    const accepted = checked.filter(Boolean).sort((a, b) => b.modified - a.modified);
    if (version !== importVersion) { accepted.forEach(photo => URL.revokeObjectURL(photo.url)); return; }
    if (!accepted.length) { report('เลือกรูป PNG, JPG หรือ WebP ที่เปิดได้ ขนาดไม่เกิน 20 MB ต่อรูป'); return; }
    photos.filter(photo => !photo.sample).forEach(photo => URL.revokeObjectURL(photo.url));
    photos = accepted;
    selected = 0;
    renderLibrary();
    if (viewer.open) showPhoto(0);
    else openViewer(0, find('[data-open-screenshots]'));
    if (accepted.length !== files.length) report(`แสดง ${accepted.length} รูป · รองรับครั้งละ 30 รูป และไม่เกิน 20 MB ต่อรูป โดยข้ามไฟล์ที่เปิดไม่ได้`);
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) photos.filter(photo => !photo.sample).forEach(photo => URL.revokeObjectURL(photo.url));
  });
  renderLibrary();
})();
