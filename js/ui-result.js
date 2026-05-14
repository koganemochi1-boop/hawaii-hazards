// Small helper that owns the right-side result panel.

export function renderResultPanel({ title, body }) {
  const panel = document.getElementById('result-panel');
  const t = document.getElementById('result-title');
  const b = document.getElementById('result-body');
  t.textContent = title;
  b.innerHTML = body;
  panel.classList.remove('hidden');
}

export function hideResultPanel() {
  document.getElementById('result-panel').classList.add('hidden');
}

// Wire up the close button (called once on boot)
export function wireCloseButtons() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    const target = btn.getAttribute('data-close');
    btn.addEventListener('click', () => {
      document.getElementById(target).classList.add('hidden');
    });
  });
}
