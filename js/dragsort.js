// Sortera rader genom att hålla fingret på ett handtag och dra upp eller ned.
// Ett kort tryck på handtaget fungerar som vanligt (öppnar menyn).

const HOLD_MS = 280;      // så länge man håller innan dragningen börjar
const MOVE_CANCEL = 10;   // rör sig fingret mer än så före det: det var en scrollning
const EDGE = 80;          // nära skärmkanten: scrolla sidan automatiskt

/**
 * listEl: elementet med raderna. rowSel: väljare för rader. handleSel: väljare för handtaget.
 * onMove(from, to): anropas när en rad har flyttats från index `from` till `to`.
 */
export function enableDragSort(listEl, { rowSel, handleSel, onMove, holdMs = HOLD_MS }) {
  let timer = 0;
  let drag = null;
  let start = null;
  let suppressClick = false;

  listEl.addEventListener('pointerdown', e => {
    const handle = e.target.closest(handleSel);
    if (!handle || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = handle.closest(rowSel);
    start = { x: e.clientX, y: e.clientY, row, handle, id: e.pointerId };
    timer = setTimeout(() => begin(e.clientY), holdMs);
  });

  listEl.addEventListener('contextmenu', e => { if (e.target.closest(handleSel)) e.preventDefault(); });

  // Klicket efter en dragning ska inte öppna menyn.
  listEl.addEventListener('click', e => {
    if (suppressClick && e.target.closest(handleSel)) { e.stopPropagation(); e.preventDefault(); }
    suppressClick = false;
  }, true);

  window.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    if (!drag) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_CANCEL) cancel();
      return;
    }
    e.preventDefault();
    drag.clientY = e.clientY;
    update();
  }, { passive: false });

  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // Hindrar sidan från att scrolla medan man drar.
  listEl.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

  function cancel() {
    clearTimeout(timer);
    start = null;
  }

  function begin(clientY) {
    const rows = [...listEl.querySelectorAll(rowSel)];
    const index = rows.indexOf(start.row);
    if (index < 0) return cancel();
    try { start.handle.setPointerCapture(start.id); } catch { /* ok */ }
    const rects = rows.map(r => { const b = r.getBoundingClientRect(); return { top: b.top + scrollY, height: b.height }; });
    const gap = rows.length > 1 ? Math.max(0, rects[1].top - rects[0].top - rects[0].height) : 8;
    drag = { rows, rects, index, target: index, gap, startY: clientY + scrollY, clientY, raf: 0 };
    start.row.classList.add('dragging');
    listEl.classList.add('sorting');
    navigator.vibrate?.(12);
    autoScroll();
  }

  function update() {
    const { rows, rects, index, gap } = drag;
    const dy = drag.clientY + scrollY - drag.startY;
    rows[index].style.transform = `translateY(${dy}px)`;
    const center = rects[index].top + rects[index].height / 2 + dy;
    let target = index;
    for (let j = index + 1; j < rows.length; j++) if (center > rects[j].top + rects[j].height / 2) target = j;
    for (let j = index - 1; j >= 0; j--) if (center < rects[j].top + rects[j].height / 2) target = j;
    drag.target = target;
    const shift = rects[index].height + gap;
    rows.forEach((r, j) => {
      if (j === index) return;
      let y = 0;
      if (index < target && j > index && j <= target) y = -shift;
      if (target < index && j >= target && j < index) y = shift;
      r.style.transform = y ? `translateY(${y}px)` : '';
    });
  }

  function autoScroll() {
    if (!drag) return;
    const y = drag.clientY;
    let speed = 0;
    if (y < EDGE) speed = -Math.ceil((EDGE - y) / 6);
    else if (y > innerHeight - EDGE) speed = Math.ceil((y - (innerHeight - EDGE)) / 6);
    if (speed) { scrollBy(0, speed); update(); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function end(e) {
    if (!start || (e && e.pointerId !== start.id)) return;
    clearTimeout(timer);
    if (drag) {
      cancelAnimationFrame(drag.raf);
      const { rows, index, target } = drag;
      rows.forEach(r => { r.style.transform = ''; });
      start.row.classList.remove('dragging');
      listEl.classList.remove('sorting');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      drag = null;
      if (target !== index) onMove(index, target);
    }
    start = null;
  }
}
