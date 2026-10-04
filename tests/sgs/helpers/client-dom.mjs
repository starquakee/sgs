// A small DOM harness exercises production event wiring/lifecycle, not geometry.
// Actual browser rendering and native focus restoration remain parent QA.
export class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.listeners = new Map(); this.attrs = {}; this.className = ''; this.dataset = {};
    this.classList = { contains: value => this.className.split(' ').includes(value), add: value => { this.className += ` ${value}`; },
      remove: value => { this.className = this.className.split(' ').filter(item => item !== value).join(' '); },
      toggle: (value, force) => { this.classList[force ? 'add' : 'remove'](value); } };
  }
  set innerHTML(html) {
    this.children = [];
    for (const [, tag, attrs] of html.matchAll(/<(div|h2|p|button|select|input|output)\b([^>]*)>/g)) {
      const node = new Node(tag);
      for (const [, key, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) { node.attrs[key] = value ?? ''; if (key === 'name') node.name = value; if (key === 'class') node.className = value; }
      this.append(node);
    }
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  get parentNode() { return this.parent; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  insertBefore(node, before) { node.parent = this; this.children.splice(this.children.indexOf(before), 0, node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  querySelectorAll(selector) {
    return this.children.filter(node => selector.split(',').some(part => {
      if (part.startsWith('.')) return node.classList.contains(part.slice(1));
      if (part.startsWith('[')) { const [, key, value] = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/); return key in node.attrs && (value === undefined || node.attrs[key] === value); }
      return node.tagName === part;
    }));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name) { const event = { preventDefault() {}, stopPropagation() {} }; for (const callback of this.listeners.get(name) || []) callback(event); this[`on${name}`]?.(event); }
  showModal() { this.open = true; }
  focus() { this.focused = true; }
  close() { this.open = false; queueMicrotask(() => this.emit('close')); }
}
export function dom() {
  const document = new Node('document'); document.body = new Node('body'); document.documentElement = new Node('html');
  document.hidden = false; document.createElement = tag => new Node(tag);
  return document;
}
