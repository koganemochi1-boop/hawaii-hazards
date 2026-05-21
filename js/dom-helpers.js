// Tiny typed shorthands over document.getElementById / querySelector. The
// goal is to keep call sites readable while satisfying tsc — `const x =
// document.getElementById('x')` is `HTMLElement | null`, but the moment we
// access `.value`, `.dataset`, or `.checked` we need a narrower type.
//
// Each helper does a single cast and assumes the caller picked the right one.
// They return `null` when the element is missing so callers can null-guard
// (or chain with `?.`) where it actually matters.

/**
 * Element by id, typed as HTMLElement (has .dataset, .style, .classList).
 * @param {string} id
 * @returns {HTMLElement | null}
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Element by id, typed as HTMLInputElement (has .value, .checked, .disabled).
 * @param {string} id
 * @returns {HTMLInputElement | null}
 */
export function $input(id) {
  return /** @type {HTMLInputElement | null} */ (document.getElementById(id));
}

/**
 * Element by id, typed as HTMLButtonElement (has .disabled).
 * @param {string} id
 * @returns {HTMLButtonElement | null}
 */
export function $button(id) {
  return /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
}

/**
 * Element by id, typed as HTMLSelectElement.
 * @param {string} id
 * @returns {HTMLSelectElement | null}
 */
export function $select(id) {
  return /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
}

/**
 * Element by id, typed as HTMLTextAreaElement.
 * @param {string} id
 * @returns {HTMLTextAreaElement | null}
 */
export function $textarea(id) {
  return /** @type {HTMLTextAreaElement | null} */ (document.getElementById(id));
}

/**
 * Narrow EventTarget down to HTMLElement. Use in event handlers when you
 * need to call .closest(), .dataset, etc. Returns null if the target isn't
 * an Element.
 * @param {EventTarget | null} t
 * @returns {HTMLElement | null}
 */
export function asElement(t) {
  return t instanceof HTMLElement ? t : null;
}

/**
 * Narrow an Element-typed value (from querySelector, forEach, etc.) to
 * HTMLElement so .dataset, .style, .classList are reachable.
 * @param {Element | null | undefined} e
 * @returns {HTMLElement | null}
 */
export function asHtml(e) {
  return e instanceof HTMLElement ? e : null;
}

/**
 * Narrow an Element to HTMLInputElement.
 * @param {Element | null | undefined} e
 * @returns {HTMLInputElement | null}
 */
export function asInput(e) {
  return e instanceof HTMLInputElement ? e : null;
}

// -- "Must get" variants -------------------------------------------------
//
// Throw if the element is missing. Use when the element is structurally
// required — the program can't function without it, so failing fast at
// init time is better than dereferencing `null` later.
//
// All return non-null typed values, which lets callers use them under
// strictNullChecks without `?.` clutter.

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export function mustGet$(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required element #${id} not found in DOM`);
  return el;
}

/**
 * @param {string} id
 * @returns {HTMLInputElement}
 */
export function mustGet$input(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Required input #${id} not found (or not an <input>)`);
  }
  return el;
}

/**
 * @param {string} id
 * @returns {HTMLButtonElement}
 */
export function mustGet$button(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Required button #${id} not found (or not a <button>)`);
  }
  return el;
}

/**
 * @param {string} id
 * @returns {HTMLFormElement}
 */
export function mustGet$form(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLFormElement)) {
    throw new Error(`Required form #${id} not found (or not a <form>)`);
  }
  return el;
}

/**
 * Narrow an Element to HTMLElement, throwing if it isn't one. Used when
 * iterating querySelectorAll results that we know to be HTMLElements (e.g.,
 * .dataset access is needed downstream).
 * @param {Element | null | undefined} e
 * @returns {HTMLElement}
 */
export function mustHtml(e) {
  if (!(e instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return e;
}
