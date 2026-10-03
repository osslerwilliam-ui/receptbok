// Långtryck: håll fingret på ett element en stund för att göra något annat än ett vanligt tryck
// (t.ex. öppna sortering). Ett vanligt tryck fungerar som förut.

const HOLD_MS = 450;
const MOVE_CANCEL = 10;

export function onLongPress(root, selector, callback) {
  let timer = 0;
  let start = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); start = null; };

  root.addEventListener('pointerdown', e => {
    const el = e.target.closest(selector);
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      fired = true;
      navigator.vibrate?.(12);
      callback(el);
    }, HOLD_MS);
  });
  root.addEventListener('pointermove', e => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_CANCEL) cancel();
  });
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  // Klicket som följer efter ett långtryck ska inte öppna kortet.
  root.addEventListener('click', e => {
    if (fired && e.target.closest(selector)) { e.preventDefault(); e.stopPropagation(); }
    fired = false;
  }, true);
  root.addEventListener('contextmenu', e => { if (e.target.closest(selector)) e.preventDefault(); });
}
