/** Tiny DOM helpers so the UI code stays readable without a framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<{ class: string; text: string; html: string; title: string; type: string }> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.html !== undefined) node.innerHTML = attrs.html;
  if (attrs.title) node.title = attrs.title;
  if (attrs.type && 'type' in node) (node as HTMLInputElement).type = attrs.type;
  for (const child of children) node.append(child);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.firstChild.remove();
}

export function on<K extends keyof HTMLElementEventMap>(
  node: EventTarget,
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  node.addEventListener(event, handler as EventListener, options);
  return () => node.removeEventListener(event, handler as EventListener, options);
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}
