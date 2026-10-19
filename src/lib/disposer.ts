export type Cleanup = () => void;

interface Stoppable {
  stop(): void;
}

/**
 * Collects teardown work (listeners, observers, timers, animations) so a scene
 * can be torn down with a single call when its React component unmounts.
 */
export class Disposer {
  private readonly cleanups: Cleanup[] = [];

  add(cleanup: Cleanup): void {
    this.cleanups.push(cleanup);
  }

  /** Registers an animation (or anything with `stop()`) to be stopped on dispose. */
  track<T extends Stoppable>(animation: T): T {
    this.add(() => animation.stop());
    return animation;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: Window | HTMLElement,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.add(() => target.removeEventListener(type, handler, options));
  }

  timeout(callback: () => void, delayMs: number): void {
    const id = window.setTimeout(callback, delayMs);
    this.add(() => window.clearTimeout(id));
  }

  interval(callback: () => void, delayMs: number): void {
    const id = window.setInterval(callback, delayMs);
    this.add(() => window.clearInterval(id));
  }

  dispose(): void {
    while (this.cleanups.length > 0) {
      this.cleanups.pop()?.();
    }
  }
}
