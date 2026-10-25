"use client";

import { useEffect, useState } from "react";
import { INITIAL_TYPEWRITER_STATE, nextTypewriterStep, visibleText } from "./typewriter";
import styles from "./RingSection.module.css";

interface TypedPromptProps {
  prompts: readonly string[];
}

/** Types out example prompts one after another, with a blinking caret. */
export function TypedPrompt({ prompts }: TypedPromptProps) {
  const [state, setState] = useState(INITIAL_TYPEWRITER_STATE);

  useEffect(() => {
    let timeoutId = 0;
    let current = INITIAL_TYPEWRITER_STATE;

    const advance = () => {
      const step = nextTypewriterStep(current, prompts);
      current = step.state;
      setState(current);
      timeoutId = window.setTimeout(advance, step.delayMs);
    };

    advance();
    return () => window.clearTimeout(timeoutId);
  }, [prompts]);

  return (
    <div className={styles.typing}>
      “<span>{visibleText(state, prompts)}</span>
      <span className={styles.caret} />”
    </div>
  );
}
