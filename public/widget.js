/*!
 * ASSIAA — AGC web assistant widget
 * One line on any page of agc-assurances.com:
 *   <script src="https://VOTRE-SERVICE.onrender.com/widget.js" defer></script>
 * Optional: data-position="left|right", data-label="…", data-open="1"
 */
(function () {
  'use strict'

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName('script')
    return all[all.length - 1]
  })()
  var BASE = (script && script.src ? script.src : location.href).replace(/\/widget\.js.*$/, '')
  var cfg = {
    position: (script && script.getAttribute('data-position')) === 'left' ? 'left' : 'right',
    label: (script && script.getAttribute('data-label')) || 'Besoin d’aide ? Parlez à ASSIAA',
    openByDefault: script && script.getAttribute('data-open') === '1',
  }

  if (window.__ASSIAA_WIDGET__) return
  window.__ASSIAA_WIDGET__ = true

  var RED = '#E2001A'
  var NAVY = '#0A2A5E'
  var side = cfg.position

  var css = ''
    + '.assiaa-root{position:fixed;z-index:2147483000;bottom:20px;' + side + ':20px;display:flex;align-items:center;gap:10px;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}'
    + '.assiaa-pill{display:flex;align-items:center;gap:9px;background:' + NAVY + ';color:#fff;border:none;cursor:pointer;'
    + 'padding:9px 15px 9px 10px;border-radius:999px;box-shadow:0 10px 26px rgba(10,42,94,.32);font-size:.82rem;font-weight:600;'
    + 'transition:transform .15s ease,filter .15s ease;white-space:nowrap}'
    + '.assiaa-pill:hover{transform:translateY(-2px);filter:brightness(1.1)}'
    + '.assiaa-pill img{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,.7)}'
    + '.assiaa-fab{position:relative;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:' + RED + ';'
    + 'display:grid;place-items:center;box-shadow:0 12px 28px rgba(226,0,26,.42);transition:transform .15s ease,filter .15s ease;flex:0 0 auto}'
    + '.assiaa-fab:hover{transform:translateY(-2px) scale(1.03);filter:brightness(1.06)}'
    + '.assiaa-fab svg{width:26px;height:26px;fill:#fff}'
    + '.assiaa-badge{position:absolute;top:-3px;right:-3px;min-width:21px;height:21px;border-radius:11px;background:#fff;'
    + 'color:' + RED + ';font-size:.7rem;font-weight:800;display:grid;place-items:center;border:1.5px solid ' + RED + '}'
    + '.assiaa-panel{position:fixed;z-index:2147483001;bottom:20px;' + side + ':20px;width:min(420px,calc(100vw - 20px));'
    + 'height:min(700px,calc(100dvh - 40px));background:#fff;border-radius:22px;overflow:hidden;'
    + 'box-shadow:0 30px 80px rgba(10,42,94,.38);border:1px solid #E3EAF3;display:none;flex-direction:column}'
    + '.assiaa-panel.open{display:flex}'
    + '.assiaa-panel iframe{flex:1 1 auto;width:100%;border:none;background:#fff}'
    + '@media (max-width:560px){.assiaa-pill{display:none}'
    + '.assiaa-panel{width:100vw;height:100dvh;bottom:0;' + side + ':0;border-radius:0}'
    + '.assiaa-root{bottom:16px;' + side + ':16px}}'

  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  var root = document.createElement('div')
  root.className = 'assiaa-root'
  root.innerHTML =
    '<button class="assiaa-pill" aria-label="Ouvrir ASSIAA">' +
      '<img src="' + BASE + '/avatar-96.png" alt="">' +
      '<span>' + cfg.label.replace(/</g, '&lt;') + '</span>' +
    '</button>' +
    '<button class="assiaa-fab" aria-label="Ouvrir ASSIAA, votre conseillère AGC">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3C6.9 3 3 6.6 3 11c0 2.5 1.3 4.7 3.4 6.1L6 21l4.1-2.1c.6.1 1.2.1 1.9.1 5.1 0 9-3.6 9-8s-3.9-8-9-8z"/></svg>' +
      '<span class="assiaa-badge">1</span>' +
    '</button>'

  var panel = document.createElement('div')
  panel.className = 'assiaa-panel'
  var iframe = document.createElement('iframe')
  iframe.title = 'ASSIAA — conseillère AGC'
  iframe.setAttribute('allow', 'clipboard-write')
  iframe.src = BASE + '/embed?embed=1'
  panel.appendChild(iframe)

  document.body.appendChild(root)
  document.body.appendChild(panel)

  function open() {
    panel.classList.add('open')
    root.style.display = 'none'
    try { iframe.contentWindow.focus() } catch (e) {}
  }
  function close() {
    panel.classList.remove('open')
    root.style.display = ''
  }

  root.querySelector('.assiaa-fab').addEventListener('click', open)
  root.querySelector('.assiaa-pill').addEventListener('click', open)
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close() })

  // the embedded page can ask the parent to close the panel
  window.addEventListener('message', function (e) {
    if (e.data && e.data.assiaa === 'close') close()
  })

  if (cfg.openByDefault) setTimeout(open, 700)
})()
