// The rules for choosing a pathway, kept free of the page so they can be tested on their own.
//
// You work on one pathway at a time. settings.activePathway holds its id, so two can never be active at once.
// Leaving a pathway only changes which one is active: lesson progress is stored apart and is never touched here.

export const CORE_ID = 'core-60';

/**
 * - available: nothing done, not chosen
 * - selected:  chosen, not started yet
 * - active:    chosen and started
 * - paused:    has progress, but is not the one you are on
 * - complete:  every lesson is done
 */
export function pathwayState({ isActive, running, begun, done, total }) {
  if (total && done >= total) return 'complete';
  if (isActive) return running ? 'active' : 'selected';
  return begun ? 'paused' : 'available';
}

/** Moving off a started pathway deserves a question. Moving off one you only selected does not. */
export function needsConfirmToSwitch(active, targetId) {
  return Boolean(active) && active.id !== targetId && active.state === 'active';
}

/** Data saved before pathways could be chosen: a running calendar means the 60-day course is the chosen one. */
export function initialActivePathway(savedSettings) {
  if (savedSettings?.activePathway !== undefined) return savedSettings.activePathway;
  return savedSettings?.courseStart ? CORE_ID : null;
}

/** Which day of the calendar to resume on: the first lesson still open, or Day 1. */
export function resumeDay(nextLessonDay) {
  return Number.isInteger(nextLessonDay) && nextLessonDay > 0 ? nextLessonDay : 1;
}
