// Motion patterns adapted from beUI: https://beui.dev/components/motion
// Copyright (c) 2026 Saurabh Chauhan. MIT License. See THIRD_PARTY_NOTICES.md.
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, type ReactNode } from "react";

const SPRING_PRESS = { type: "spring", stiffness: 500, damping: 30, mass: 0.6 } as const;
const SPRING_LAYOUT = { type: "spring", stiffness: 360, damping: 32, mass: 0.6 } as const;

export function MotionButton({
  children,
  onClick,
  disabled = false,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={`motion-button motion-button-${variant}`}
      disabled={disabled}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={SPRING_PRESS}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </motion.button>
  );
}

export function MotionTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="motion-tabs" role="tablist" aria-label="Market action">
      {options.map((option) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === option}
          className="motion-tab"
          key={option}
          onClick={() => onChange(option)}
        >
          {value === option && (
            <motion.span className="motion-tab-active" layoutId="market-tab" transition={SPRING_LAYOUT} />
          )}
          <span>{option}</span>
        </button>
      ))}
    </div>
  );
}

export function AnimatedNumber({
  value,
  precision = 2,
}: {
  value: number;
  precision?: number;
}) {
  const reduced = useReducedMotion();
  const spring = useSpring(value, { stiffness: 220, damping: 28, mass: 0.7 });
  const display = useTransform(spring, (current) => current.toFixed(precision));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return reduced ? <>{value.toFixed(precision)}</> : <motion.span>{display}</motion.span>;
}

export function AnimatedBadge({
  tone,
  children,
}: {
  tone: "safe" | "watch" | "neutral";
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={`motion-badge motion-badge-${tone}`}
      initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(5px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={SPRING_LAYOUT}
    >
      <span className="motion-badge-dot" aria-hidden="true" />
      {children}
    </motion.span>
  );
}

export function SwapPanel({ panelKey, children }: { panelKey: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
