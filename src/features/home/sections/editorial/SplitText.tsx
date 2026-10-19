import { Fragment, type Ref } from "react";

interface SplitTextProps {
  text: string;
  wordClassName: string;
  charClassName: string;
  /** Called once per character, in reading order, to collect refs for animation. */
  registerChar: (index: number) => Ref<HTMLSpanElement>;
}

/**
 * Splits text into words (which clip their overflow) of individually animatable
 * characters, so each letter can rise up from behind its word's edge.
 */
export function SplitText({ text, wordClassName, charClassName, registerChar }: SplitTextProps) {
  let charIndex = 0;
  const words = text.split(" ");

  return words.map((word, wordIndex) => (
    <Fragment key={wordIndex}>
      {wordIndex > 0 && " "}
      <span className={wordClassName}>
        {[...word].map((char) => {
          const index = charIndex++;
          return (
            <span key={index} ref={registerChar(index)} className={charClassName}>
              {char}
            </span>
          );
        })}
      </span>
    </Fragment>
  ));
}
