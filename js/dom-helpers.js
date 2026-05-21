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
