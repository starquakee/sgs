// Reconcile only presentation nodes. Stable keys are the original pack:id.
export function reconcileKeyedHTML(container, html, keyAttribute, document = container.ownerDocument) {
  const staging = document.createElement('div'); staging.innerHTML = html;
  const active = document.activeElement;
  const focused = active?.closest?.(`[${keyAttribute}]`);
  const focusedKey = focused && container.contains(focused) ? focused.getAttribute(keyAttribute) : null;
  const previous = new Map(Array.from(container.children).filter(node => node.hasAttribute(keyAttribute)).map(node => [node.getAttribute(keyAttribute), node]));
  const next = Array.from(staging.children).map(node => {
    const existing = node.hasAttribute(keyAttribute) && previous.get(node.getAttribute(keyAttribute));
    if (!existing) return node;
    for (const attr of Array.from(existing.attributes)) if (!node.hasAttribute(attr.name)) existing.removeAttribute(attr.name);
    for (const attr of Array.from(node.attributes)) if (existing.getAttribute(attr.name) !== attr.value) existing.setAttribute(attr.name, attr.value);
    if (existing.innerHTML !== node.innerHTML) existing.innerHTML = node.innerHTML;
    return existing;
  });
  const keep = new Set(next);
  for (const child of Array.from(container.children)) if (!keep.has(child)) child.remove();
  next.forEach((node, index) => { if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null); });
  if (focusedKey && document.activeElement !== active) next.find(node => node.getAttribute(keyAttribute) === focusedKey)?.focus({ preventScroll: true });
}

export function installComposedSearch(input, search) {
  let composing = false;
  const start = () => { composing = true; };
  const update = event => { if (!composing && !event.isComposing) search(input.value); };
  const end = () => { composing = false; search(input.value); };
  input.addEventListener('compositionstart', start);
  input.addEventListener('compositionend', end);
  input.addEventListener('input', update);
  return () => {
    input.removeEventListener('compositionstart', start);
    input.removeEventListener('compositionend', end);
    input.removeEventListener('input', update);
  };
}

export function focusAfterFilterRemoval(container, index, fallback) {
  const buttons = Array.from(container.querySelectorAll('[data-filter]'));
  (buttons[Math.min(Math.max(0, index), buttons.length - 1)] || fallback).focus({ preventScroll: true });
}
