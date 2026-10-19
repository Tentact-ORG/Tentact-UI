type WritableStyleProperty = "translate" | "scale" | "opacity" | "transform";

const lastWrittenStyles = new WeakMap<HTMLElement, Partial<Record<WritableStyleProperty, string>>>();

/**
 * Writes an inline style only when its value differs from the last write.
 * Render loops call this every frame; skipping identical writes means an idle
 * page (no scroll, no pointer movement) does no style work at all.
 */
export function setStyleIfChanged(
  element: HTMLElement,
  property: WritableStyleProperty,
  value: string | number,
): void {
  const next = String(value);
  const cache = lastWrittenStyles.get(element) ?? {};
  if (cache[property] === next) return;

  cache[property] = next;
  lastWrittenStyles.set(element, cache);
  element.style[property] = next;
}
