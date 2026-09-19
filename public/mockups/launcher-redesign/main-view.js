/* Mount the approved main screen once; every route retains the live background. */
(() => {
  let ready;
  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load main preview controls'));
    document.head.append(script);
  });
  async function mount() {
    const response = await fetch('./launcher-redesign.html');
    if (!response.ok) throw new Error('Could not load main preview');
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const main = source.querySelector('.launcher');
    main.classList.add('embedded-main');
    main.hidden = true;
    main.inert = true;
    main.querySelector('.titlebar').remove();
    main.querySelector('#stars').remove();
    const definitions = document.querySelector('.icon-definitions defs');
    source.querySelectorAll('symbol').forEach(symbol => {
      if (!document.getElementById(symbol.id)) definitions.append(symbol);
    });
    document.querySelector('.entry-shell').append(main);
    document.body.append(source.querySelector('#screenshot-viewer'));
    const imagesReady = Promise.all([...main.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
    await loadScript('./launcher-redesign/app.js');
    await loadScript('./launcher-redesign/screenshots.js');
    await Promise.all([imagesReady, document.fonts.ready, ...[400,500,600].map(weight => document.fonts.load(`${weight} 14px Plex`).catch(() => {}))]);
    main.dataset.ready = 'true';
    return main;
  }
  window.LauncherMainView = {
    prepare() {
      if (!ready) ready = mount();
      return ready;
    }
  };
})();
