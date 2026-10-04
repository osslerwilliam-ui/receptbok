// Dra en rad och släpp den på ett mål (t.ex. ett recept på en grupp i kapitlet).
// Håll fingret på raden tills den lyfts, dra den till målet och släpp. Ett vanligt tryck öppnar raden.

const HOLD_MS = 400;
const MOVE_CANCEL = 10;
const EDGE = 70;

/**
 * root: vyn. itemSel: rader som går att dra. targetSel: mål att släppa på.
 * canStart(item): false = dra inte (t.ex. om det inte finns några mål).
 * onDrop(item, target): anropas när raden släpps på ett mål.
 * Returnerar en funktion som tar bort lyssnarna.
 */
export function enableDragToTarget(root, { itemSel, targetSel, canStart = () => true, onDrop }) {
  let timer = 0;
  let start = null;  // { x, y, el, id }
  let drag = null;   // { el, ghost, offX, offY, x, y, target, raf }
  let suppressClick = false;

  root.addEventListener('pointerdown', e => {
    const el = e.target.closest(itemSel);
    if (!el || !root.contains(el) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start = { x: e.clientX, y: e.clientY, el, id: e.pointerId };
    timer = setTimeout(() => begin(e.clientX, e.clientY), HOLD_MS);
  });

  const onMove = e => {
    if (!start || e.pointerId !== start.id) return;
    if (!drag) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_CANCEL) cancel();
      return;
    }
    e.preventDefault();
    drag.x = e.clientX;
    drag.y = e.clientY;
    follow();
    hitTest();
  };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  root.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', e => { if (e.target.closest(itemSel)) e.preventDefault(); });
  root.addEventListener('dragstart', e => { if (e.target.closest?.(itemSel)) e.preventDefault(); });
  root.addEventListener('click', e => {
    if (suppressClick && e.target.closest(itemSel)) { e.preventDefault(); e.stopPropagation(); }
    suppressClick = false;
  }, true);

  function cancel() { clearTimeout(timer); start = null; }

  function begin(x, y) {
    const el = start.el;
    if (!el.isConnected || !canStart(el)) return cancel();
    try { el.setPointerCapture(start.id); } catch { /* ok */ }
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('href');
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.append(ghost);
    el.classList.add('drag-source');
    root.classList.add('drag-active');
    drag = { el, ghost, offX: x - r.left, offY: y - r.top, x, y, target: null, raf: 0, left: r.left, top: r.top };
    suppressClick = true;
    navigator.vibrate?.(12);
    follow();
    autoScroll();
  }

  function follow() {
    // Raden följer fingret uppåt och nedåt men stannar i sidled (inget hamnar utanför skärmen).
    drag.ghost.style.transform = `translateY(${drag.y - drag.offY - drag.top}px) scale(1.03)`;
  }

  function hitTest() {
    // Alla element under fingret (även under t.ex. en snackbar), första målet i vyn vinner.
    const target = document.elementsFromPoint(drag.x, drag.y)
      .map(el => el.closest(targetSel)).find(t => t && root.contains(t)) || null;
    if (target === drag.target) return;
    drag.target?.classList.remove('drop-hover');
    target?.classList.add('drop-hover');
    drag.target = target;
  }

  function autoScroll() {
    if (!drag) return;
    let speed = 0;
    if (drag.y < EDGE) speed = -Math.ceil((EDGE - drag.y) / 5);
    else if (drag.y > innerHeight - EDGE) speed = Math.ceil((drag.y - (innerHeight - EDGE)) / 5);
    if (speed) { scrollBy(0, speed); hitTest(); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function end(e) {
    if (!start || (e && e.pointerId !== start.id)) return;
    clearTimeout(timer);
    if (drag) {
      cancelAnimationFrame(drag.raf);
      const { el, ghost, target } = drag;
      ghost.remove();
      el.classList.remove('drag-source');
      target?.classList.remove('drop-hover');
      root.classList.remove('drag-active');
      drag = null;
      setTimeout(() => { suppressClick = false; }, 400);
      if (target) onDrop(el, target);
    }
    start = null;
  }

  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
}
