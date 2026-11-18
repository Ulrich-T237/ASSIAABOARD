/*!
 * ASSIAA — AGC web assistant, floating widget
 *
 * Shows the assistant you already host, INSIDE the page: the panel loads
 * /embed in an iframe, so nothing opens in a new tab and the site never moves.
 * The assistant herself is untouched — same script, same menu, same brain.
 *
 *   <script src="https://assiaaboard.onrender.com/widget.js" defer></script>
 *
 * Optional attributes:
 *   data-position="left|right"     side of the bubble        (default right)
 *   data-label="…"                 text next to the bubble   (default "Besoin d’aide ? Parlez à ASSIAA")
 *   data-open="1"                  open on page load
 *   data-badge="1"                 small red counter          (default "1")
 */
(function () {
  'use strict'

  if (window.__ASSIAA_WIDGET__) return
  window.__ASSIAA_WIDGET__ = true

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName('script')
    return all[all.length - 1]
  })()
  var BASE = (script && script.src ? script.src : location.href).replace(/\/widget\.js.*$/, '')
  var attr = function (n) { return (script && script.getAttribute(n)) || '' }

  var CFG = {
    position: attr('data-position') === 'left' ? 'left' : 'right',
    label: attr('data-label') || 'Besoin d’aide ? Parlez à ASSIAA',
    badge: attr('data-badge') === '0' ? '' : (attr('data-badge') || '1'),
    open: attr('data-open') === '1'
  }

  var NAVY = '#0A2A5E'
  var RED = '#E2001A'
  var side = CFG.position

  var CSS = [
    '.assiaa-w{position:fixed;z-index:2147483000;bottom:22px;' + side + ':22px;display:flex;align-items:center;gap:10px;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',

    '.assiaa-w-pill{display:flex;align-items:center;gap:9px;background:' + NAVY + ';color:#fff;border:none;cursor:pointer;',
    'padding:9px 15px 9px 10px;border-radius:999px;box-shadow:0 10px 26px rgba(10,42,94,.32);font-size:.82rem;font-weight:600;',
    'transition:transform .15s ease,filter .15s ease;white-space:nowrap;max-width:calc(100vw - 120px);overflow:hidden;text-overflow:ellipsis}',
    '.assiaa-w-pill:hover{transform:translateY(-2px);filter:brightness(1.1)}',
    '.assiaa-w-pill img{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,.75);flex:0 0 auto}',

    '.assiaa-w-fab{position:relative;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:' + RED + ';',
    'display:grid;place-items:center;box-shadow:0 12px 28px rgba(226,0,26,.42);transition:transform .15s ease,filter .15s ease;flex:0 0 auto}',
    '.assiaa-w-fab:hover{transform:translateY(-2px) scale(1.03);filter:brightness(1.06)}',
    '.assiaa-w-fab svg{width:27px;height:27px;fill:#fff}',
    '.assiaa-w-badge{position:absolute;top:-3px;right:-3px;min-width:21px;height:21px;border-radius:11px;background:#fff;',
    'color:' + RED + ';font-size:.7rem;font-weight:800;display:grid;place-items:center;border:1.5px solid ' + RED + '}',

    '.assiaa-w-panel{position:fixed;z-index:2147483001;bottom:22px;' + side + ':22px;width:min(420px,calc(100vw - 24px));',
    'height:min(680px,calc(100dvh - 44px));background:#fff;border-radius:20px;overflow:hidden;display:none;',
    'box-shadow:0 30px 80px rgba(10,42,94,.38);border:1px solid #DDE4EE}',
    '.assiaa-w-panel.is-open{display:block}',
    '.assiaa-w-panel iframe{display:block;width:100%;height:100%;border:none;background:#fff}',

    '@media (max-width:560px){',
    '.assiaa-w-pill{display:none}',
    '.assiaa-w-panel{width:100vw;height:100dvh;bottom:0;' + side + ':0;border-radius:0;border:none}',
    '.assiaa-w{bottom:16px;' + side + ':16px}',
    '}'
  ].join('')

  var style = document.createElement('style')
  style.setAttribute('data-assiaa', 'widget')
  style.textContent = CSS
  document.head.appendChild(style)

  var wrap = document.createElement('div')
  wrap.className = 'assiaa-w'
  wrap.innerHTML =
    '<button class="assiaa-w-pill" type="button" aria-label="Ouvrir ASSIAA">' +
      '<img src="' + BASE + '/avatar-96.png" alt="">' +
      '<span>' + CFG.label.replace(/</g, '&lt;') + '</span>' +
    '</button>' +
    '<button class="assiaa-w-fab" type="button" aria-label="Ouvrir ASSIAA">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.5 1.3 4.7 3.4 6.2v3.4l3.1-1.7c.9.2 1.8.3 2.7.3 5.1 0 9.2-3.6 9.2-8.2S17.1 3 12 3z"/></svg>' +
      (CFG.badge ? '<span class="assiaa-w-badge">' + CFG.badge + '</span>' : '') +
    '</button>'

  var panel = document.createElement('section')
  panel.className = 'assiaa-w-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'ASSIAA — Assistance AGC')

  document.body.appendChild(panel)
  document.body.appendChild(wrap)

  var pill = wrap.querySelector('.assiaa-w-pill')
  var fab = wrap.querySelector('.assiaa-w-fab')
  var loaded = false

  function open() {
    if (!loaded) {
      var frame = document.createElement('iframe')
      frame.src = BASE + '/embed'
      frame.title = 'ASSIAA — Assistance AGC'
      frame.setAttribute('allow', 'clipboard-write')
      panel.appendChild(frame)
      loaded = true
    }
    panel.classList.add('is-open')
    wrap.style.display = 'none'
    try { panel.querySelector('iframe').focus() } catch (e) {}
  }

  function close() {
    panel.classList.remove('is-open')
    wrap.style.display = ''
  }

  pill.addEventListener('click', open)
  fab.addEventListener('click', close ? open : open)
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.assiaa === 'close') close()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) close()
  })

  window.ASSIAA = { open: open, close: close }

  if (CFG.open) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open)
    else open()
  }
})()
