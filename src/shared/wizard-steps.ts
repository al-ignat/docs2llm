import * as p from "@clack/prompts";

interface Step {
  label: string;
}

interface StepTracker {
  /** Show the step tracker line for the current step */
  show(): void;
  /** Advance to the next step */
  advance(): void;
  /** Mark all steps as completed */
  complete(): void;
}

export function createStepTracker(steps: Step[]): StepTracker {
  let current = 0;

  function render(): string {
    return steps
      .map((step, i) => {
        if (i < current) return `\u2714 ${step.label}`;
        if (i === current) return `\u25CF ${step.label}`;
        return `\u25CB ${step.label}`;
      })
      .join("   ");
  }

  return {
    show() {
      p.log.info(render());
    },
    advance() {
      if (current < steps.length - 1) current++;
    },
    complete() {
      current = steps.length;
      p.log.info(steps.map((s) => `\u2714 ${s.label}`).join("   "));
    },
  };
}
