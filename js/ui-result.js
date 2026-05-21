// Small helper that owns the right-side result panel.

import { mustGet$ } from './dom-helpers.js';

export function renderResultPanel({ title, body }) {
  const panel = mustGet$('result-panel');
  const t = mustGet$('result-title');
  const b = mustGet$('result-body');
  t.textContent = title;
  b.innerHTML = body;
  panel.classList.remove('hidden');
}

export function hideResultPanel() {
  mustGet$('result-panel').classList.add('hidden');
}

// Wire up the close button (called once on boot)
export function wireCloseButtons() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    const target = btn.getAttribute('data-close');
    if (!target) return;
    btn.addEventListener('click', () => {
      const el = document.getElementById(target);
      if (el) el.classList.add('hidden');
    });
  });
}
