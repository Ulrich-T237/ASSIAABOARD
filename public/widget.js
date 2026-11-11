/*!
 * ASSIAA — AGC web assistant widget
 * Drop this one line on any page of agc-assurances.com:
 *   <script src="https://VOTRE-SERVICE.onrender.com/widget.js" defer></script>
 * Optional: data-position="left|right", data-label="…", data-open="1"
 * The assistant opens inside a floating panel, in-page — no redirect.
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
    label: (script && script.getAttribute('data-label')) || 'Besoin d’un conseil ?',
    openByDefault: script && script.getAttribute('data-open') === '1',
    accent: (script && script.getAttribute('data-accent')) || '#25d366',
    navy: '#0b1f33',
  }

  if (window.__ASSIAA_WIDGET__) return
  window.__ASSIAA_WIDGET__ = true

  var css = ''
    + '.assiaa-root{position:fixed;z-index:2147483000;bottom:22px;' + cfg.position + ':22px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}'
    + '.assiaa-bubble{display:flex;align-items:center;gap:11px;background:' + cfg.navy + ';color:#eaf2fb;border:none;cursor:pointer;'
    + 'padding:11px 16px 11px 11px;border-radius:999px;box-shadow:0 14px 34px rgba(6,20,34,.42);transition:transform .15s ease,filter .15s ease}'
    + '.assiaa-bubble:hover{transform:translateY(-2px);filter:brightness(1.08)}'
    + '.assiaa-ava{width:36px;height:36px;border-radius:50%;background:linear-gradient(145deg,#7fd4ff,#2a86d9);color:#06182a;'
    + 'font-weight:800;display:grid;place-items:center;font-size:1.05rem;letter-spacing:.5px}'
    + '.assiaa-txt{text-align:left;line-height:1.15}'
    + '.assiaa-txt b{display:block;font-size:.92rem;letter-spacing:1.4px}'
    + '.assiaa-txt span{display:block;font-size:.72rem;opacity:.75;margin-top:2px}'
    + '.assiaa-pulse{position:absolute;inset:0;border-radius:999px;box-shadow:0 0 0 0 rgba(37,211,102,.55);'
    + 'animation:assiaaPulse 2.4s infinite;pointer-events:none}'
    + '@keyframes assiaaPulse{0%{box-shadow:0 0 0 0 rgba(37,211,102,.45)}70%{box-shadow:0 0 0 16px rgba(37,211,102,0)}100%{box-shadow:0 0 0 0 rgba(37,211,102,0)}}'
    + '.assiaa-panel{position:fixed;z-index:2147483001;bottom:22px;' + cfg.position + ':22px;width:min(400px,calc(100vw - 24px));'
    + 'height:min(660px,calc(100dvh - 44px));background:#0b1f33;border-radius:20px;overflow:hidden;'
    + 'box-shadow:0 30px 80px rgba(0,0,0,.6);border:1px solid #1d4468;display:none;flex-direction:column;'
    + 'transform:translateY(12px) scale(.98);opacity:0;transition:transform .18s ease,opacity .18s ease}'
    + '.assiaa-panel.open{display:flex;transform:none;opacity:1}'
    + '.assiaa-panel iframe{flex:1 1 auto;width:100%;border:none;background:#0b1f33}'
    + '.assiaa-close{position:absolute;top:10px;' + (cfg.position === 'left' ? 'right' : 'right') + ':10px;z-index:2;'
    + 'width:30px;height:30px;border-radius:50%;border:none;background:rgba(10,25,40,.75);color:#cfe6fa;font-size:16px;'
    + 'cursor:pointer;line-height:1}'
    + '@media (max-width:560px){.assiaa-panel{width:100vw;height:100dvh;bottom:0;' + cfg.position + ':0;border-radius:0}'
    + '.assiaa-root{bottom:16px;' + cfg.position + ':16px}}'

  var style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  var root = document.createElement('div')
  root.className = 'assiaa-root'
  root.innerHTML =
    '<button class="assiaa-bubble" aria-label="Ouvrir ASSIAA, votre conseillère AGC">' +
      '<span class="assiaa-pulse"></span>' +
      '<span class="assiaa-ava">A</span>' +
      '<span class="assiaa-txt"><b>ASSIAA</b><span>' + cfg.label.replace(/</g, '&lt;') + '</span></span>' +
    '</button>'

  var panel = document.createElement('div')
  panel.className = 'assiaa-panel'
  panel.innerHTML = '<button class="assiaa-close" aria-label="Fermer">✕</button>'
  var iframe = document.createElement('iframe')
  iframe.title = 'ASSIAA — assistante AGC'
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

  root.querySelector('.assiaa-bubble').addEventListener('click', open)
  panel.querySelector('.assiaa-close').addEventListener('click', close)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close()
  })

  if (cfg.openByDefault) setTimeout(open, 700)
})()
