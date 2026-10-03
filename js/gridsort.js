// Sortera rutor direkt i ett rutnät: håll fingret på en ruta tills den lyfts och dra den till ny plats.
// De andra rutorna glider undan. Ett vanligt tryck öppnar rutan som vanligt.

const HOLD_MS = 400;     // så länge man håller innan rutan lyfts
const MOVE_CANCEL = 10;  // rör sig fingret mer än så innan dess: det var en scrollning
const EDGE = 70;         // nära skärmkanten: scrolla automatiskt

/**
 * root: vyn (stabil, även om rutnäten ritas om). gridSel: rutnäten. itemSel: rutor som går att flytta.
 * onDrop(grid, ids): anropas med rutnätet och rutornas id (data-id) i ny ordning när något har flyttats.
 * Andra element i rutnätet (t.ex. "Nytt kapitel") ligger kvar där de är.
 * Returnerar en funktion som tar bort lyssnarna.
 */
export function enableGridSort(root, { gridSel, itemSel, onDrop }) {
  let timer = 0;
  let start = null;   // { x, y, el, id }
  let drag = null;    // { el, offX, offY, x, y, raf, moved }
  let suppressClick = false;

  let container = null;
  const items = () => [...container.querySelectorAll(itemSel)];

  root.addEventListener('pointerdown', e => {
    const el = e.target.closest(itemSel);
    const grid = el?.closest(gridSel);
    if (!el || !grid || (e.pointerType === 'mouse' && e.button !== 0)) return;
    container = grid;
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
    reorderAt(e.clientX, e.clientY);
  };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // Hindra sidan från att scrolla medan en ruta dras.
  root.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  // Ingen länkmeny vid långtryck, och klicket efter en dragning ska inte öppna rutan.
  root.addEventListener('contextmenu', e => { if (e.target.closest(itemSel)) e.preventDefault(); });
  // Webbläsarens egen "dra länken" ska inte ta över.
  root.addEventListener('dragstart', e => { if (e.target.closest?.(itemSel)) e.preventDefault(); });
  root.addEventListener('click', e => {
    if (suppressClick && e.target.closest(itemSel)) { e.preventDefault(); e.stopPropagation(); }
    suppressClick = false;
  }, true);

  function cancel() { clearTimeout(timer); start = null; }

  function begin(x, y) {
    const el = start.el;
    if (!el.isConnected) return cancel();
    try { el.setPointerCapture(start.id); } catch { /* ok */ }
    const r = el.getBoundingClientRect();
    drag = { el, offX: x - r.left, offY: y - r.top, x, y, raf: 0, moved: false, before: items().map(i => i.dataset.id).join() };
    el.classList.add('grid-dragging');
    container.classList.add('grid-sorting');
    suppressClick = true;
    navigator.vibrate?.(12);
    follow();
    autoScroll();
  }

  // Placera rutan under fingret (räknat från dess plats i rutnätet).
  function follow() {
    const el = drag.el;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${drag.x - drag.offX - r.left}px, ${drag.y - drag.offY - r.top}px) scale(1.04)`;
  }

  // Rutans plats i rutnätet, utan pågående glid-animation.
  function homeRect(it) {
    const r = it.getBoundingClientRect();
    const t = getComputedStyle(it).transform;
    if (!t || t === 'none') return r;
    const m = new DOMMatrixReadOnly(t);
    return { left: r.left - m.m41, right: r.right - m.m41, top: r.top - m.m42, bottom: r.bottom - m.m42, width: r.width, height: r.height };
  }

  function reorderAt(x, y) {
    const list = items();
    const from = list.indexOf(drag.el);
    let target = -1;
    let best = Infinity;
    list.forEach((it, i) => {
      if (it === drag.el) return;
      const r = homeRect(it);
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && d < best) { best = d; target = i; }
    });
    if (target < 0 || target === from) return;
    // FLIP: kom ihåg var rutorna var, flytta i DOM, animera från gamla platsen.
    const others = list.filter(it => it !== drag.el);
    const firsts = new Map(others.map(it => [it, it.getBoundingClientRect()])); // där de syns just nu
    const ref = list[target];
    if (target > from) ref.after(drag.el); else ref.before(drag.el);
    drag.moved = true;
    for (const it of others) {
      const a = firsts.get(it);
      const b = it.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      it.style.transition = 'none';
      it.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        it.style.transition = 'transform 180ms ease';
        it.style.transform = '';
      });
    }
    follow();
  }

  function autoScroll() {
    if (!drag) return;
    let speed = 0;
    if (drag.y < EDGE) speed = -Math.ceil((EDGE - drag.y) / 5);
    else if (drag.y > innerHeight - EDGE) speed = Math.ceil((drag.y - (innerHeight - EDGE)) / 5);
    if (speed) { scrollBy(0, speed); follow(); reorderAt(drag.x, drag.y); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function end(e) {
    if (!start || (e && e.pointerId !== start.id)) return;
    clearTimeout(timer);
    if (drag) {
      cancelAnimationFrame(drag.raf);
      const el = drag.el;
      el.classList.remove('grid-dragging');
      el.style.transition = 'transform 160ms ease';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 200);
      container.classList.remove('grid-sorting');
      const ids = items().map(i => i.dataset.id);
      const changed = ids.join() !== drag.before;
      drag = null;
      setTimeout(() => { suppressClick = false; }, 400);
      if (changed) onDrop(container, ids);
    }
    start = null;
  }

  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
}
