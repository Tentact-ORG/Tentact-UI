export interface TypewriterState {
  promptIndex: number;
  /** Number of characters of the current prompt that are shown. */
  length: number;
  isDeleting: boolean;
}

export interface TypewriterStep {
  state: TypewriterState;
  /** Milliseconds to wait before taking the next step. */
  delayMs: number;
}

const PAUSE_WHEN_TYPED_MS = 1800;
const DELETE_DELAY_MS = 16;
/** Characters removed per step while deleting — deleting runs faster than typing. */
const DELETE_STEP = 2;

function randomTypingDelay(): number {
  return 38 + Math.random() * 40;
}

export const INITIAL_TYPEWRITER_STATE: TypewriterState = { promptIndex: 0, length: 0, isDeleting: false };

/**
 * Advances the typewriter by one step: type a character, pause once the prompt
 * is complete, delete it two characters at a time, then move to the next prompt.
 */
export function nextTypewriterStep(current: TypewriterState, prompts: readonly string[]): TypewriterStep {
  const prompt = prompts[current.promptIndex];

  if (!current.isDeleting) {
    const length = current.length + 1;
    if (length > prompt.length) {
      return { state: { ...current, length, isDeleting: true }, delayMs: PAUSE_WHEN_TYPED_MS };
    }
    return { state: { ...current, length }, delayMs: randomTypingDelay() };
  }

  const length = current.length - DELETE_STEP;
  if (length <= 0) {
    const promptIndex = (current.promptIndex + 1) % prompts.length;
    return { state: { promptIndex, length: 0, isDeleting: false }, delayMs: randomTypingDelay() };
  }
  return { state: { ...current, length }, delayMs: DELETE_DELAY_MS };
}

/** The text currently visible for a given state. */
export function visibleText(state: TypewriterState, prompts: readonly string[]): string {
  return prompts[state.promptIndex].slice(0, Math.max(0, state.length));
}
