// Håller skärmen tänd i kokläget (Screen Wake Lock API).
// Låset släpps automatiskt när appen göms, så det begärs igen när appen syns.

let lock = null;
let wanted = false;
let listener = () => {};

export const supported = 'wakeLock' in navigator;

async function acquire() {
  if (!supported || lock) return !!lock;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; listener(false); });
    if (!wanted) { lock.release(); return false; }
    listener(true);
    return true;
  } catch {
    listener(false);
    return false;
  }
}

/** Slår på låset. onState(true/false) anropas när låset får eller tappar effekt. */
export function enable(onState = () => {}) {
  wanted = true;
  listener = onState;
  return acquire();
}

export function disable() {
  wanted = false;
  listener = () => {};
  if (lock) { lock.release(); lock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
