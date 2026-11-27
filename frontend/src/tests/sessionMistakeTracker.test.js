import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSessionMistakeTracker,
  DEFAULT_TRACKER_OPTIONS,
} from '../services/sessionMistakeTracker.js';
import { EducationalCategory } from '../services/educationalFeedback.js';

describe('AeroSolve — Session Mistake Tracker (Milestone 7.2 Phase D)', () => {
  let tracker;

  beforeEach(() => {
    tracker = createSessionMistakeTracker({ repetitionThreshold: 2 });
  });

  describe('1. Empty Session & Initialization Behavior', () => {
    it('initializes with zero mistakes, empty counts, and null primary pattern', () => {
      expect(DEFAULT_TRACKER_OPTIONS.repetitionThreshold).toBe(2);
      expect(DEFAULT_TRACKER_OPTIONS.maxHistoryLength).toBe(20);

      const summary = tracker.getSummary();

      expect(summary.totalMistakes).toBe(0);
      expect(summary.categoryCounts).toEqual({});
      expect(summary.repeatedCategories).toEqual([]);
      expect(summary.primaryPattern).toBeNull();
      expect(summary.patternInsight).toBeNull();
      expect(tracker.getCount(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(0);
      expect(tracker.hasPattern(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(false);
    });

    it('ignores empty or NONE category events', () => {
      tracker.recordMistake(null);
      tracker.recordMistake('');
      tracker.recordMistake(EducationalCategory.NONE);

      expect(tracker.getSummary().totalMistakes).toBe(0);
      expect(tracker.getSummary().categoryCounts).toEqual({});
    });
  });

  describe('2. Repetition Counting & Pattern Thresholds', () => {
    it('tracks single occurrence without triggering pattern threshold', () => {
      const summary = tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');

      expect(summary.totalMistakes).toBe(1);
      expect(summary.categoryCounts[EducationalCategory.PRECEDENCE_VIOLATION]).toBe(1);
      expect(summary.repeatedCategories).toEqual([]);
      expect(summary.primaryPattern).toBeNull();
      expect(summary.patternInsight).toBeNull();
      expect(tracker.hasPattern(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(false);
    });

    it('triggers pattern insight when repetition threshold is reached', () => {
      tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');
      const summary = tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '5 * 4');

      expect(summary.totalMistakes).toBe(2);
      expect(summary.categoryCounts[EducationalCategory.PRECEDENCE_VIOLATION]).toBe(2);
      expect(summary.repeatedCategories).toContain(EducationalCategory.PRECEDENCE_VIOLATION);
      expect(summary.primaryPattern).toBe(EducationalCategory.PRECEDENCE_VIOLATION);
      expect(summary.patternInsight).not.toBeNull();
      expect(summary.patternInsight.title).toBe('Order of Operations Pattern');
      expect(summary.patternInsight.supportiveMessage).toContain('PEMDAS / BODMAS');
      expect(summary.patternInsight.recommendedHintLevel).toBe(2);
      expect(tracker.hasPattern(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(true);
    });

    it('tracks multiple distinct categories independently', () => {
      tracker.recordMistake(EducationalCategory.ARITHMETIC_SLIP, 1, '8 + 7');
      tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');
      tracker.recordMistake(EducationalCategory.ARITHMETIC_SLIP, 1, '8 + 5');

      const summary = tracker.getSummary();
      expect(summary.totalMistakes).toBe(3);
      expect(summary.categoryCounts[EducationalCategory.ARITHMETIC_SLIP]).toBe(2);
      expect(summary.categoryCounts[EducationalCategory.PRECEDENCE_VIOLATION]).toBe(1);
      expect(summary.repeatedCategories).toEqual([EducationalCategory.ARITHMETIC_SLIP]);
      expect(summary.primaryPattern).toBe(EducationalCategory.ARITHMETIC_SLIP);
      expect(summary.patternInsight.title).toBe('Calculation Slip Pattern');
    });

    it('supports custom repetition thresholds', () => {
      const customTracker = createSessionMistakeTracker({ repetitionThreshold: 3 });
      customTracker.recordMistake(EducationalCategory.SIGN_ERROR, 1, '3');
      customTracker.recordMistake(EducationalCategory.SIGN_ERROR, 1, '3');

      expect(customTracker.hasPattern(EducationalCategory.SIGN_ERROR)).toBe(false);

      customTracker.recordMistake(EducationalCategory.SIGN_ERROR, 1, '3');
      expect(customTracker.hasPattern(EducationalCategory.SIGN_ERROR)).toBe(true);
      expect(customTracker.getSummary().patternInsight.title).toBe('Sign Check Pattern');
    });
  });

  describe('3. Lifecycle: Reset & Undo Pruning', () => {
    it('completely clears all tracking data on reset', () => {
      tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');
      tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');
      expect(tracker.hasPattern(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(true);

      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.totalMistakes).toBe(0);
      expect(summary.categoryCounts).toEqual({});
      expect(summary.repeatedCategories).toEqual([]);
      expect(summary.primaryPattern).toBeNull();
      expect(summary.patternInsight).toBeNull();
    });

    it('prunes mistakes associated with undone steps', () => {
      // Step 1 attempts
      tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');

      // Step 2 attempts (after step 1 was completed)
      tracker.recordMistake(EducationalCategory.ARITHMETIC_SLIP, 2, '14 + 10');
      tracker.recordMistake(EducationalCategory.ARITHMETIC_SLIP, 2, '14 + 12');

      expect(tracker.getSummary().totalMistakes).toBe(3);
      expect(tracker.hasPattern(EducationalCategory.ARITHMETIC_SLIP)).toBe(true);

      // Student undoes step 2 back to step 1
      tracker.pruneToStep(1);

      const summary = tracker.getSummary();
      expect(summary.totalMistakes).toBe(1);
      expect(summary.categoryCounts[EducationalCategory.PRECEDENCE_VIOLATION]).toBe(1);
      expect(summary.categoryCounts[EducationalCategory.ARITHMETIC_SLIP]).toBeUndefined();
      expect(tracker.hasPattern(EducationalCategory.ARITHMETIC_SLIP)).toBe(false);
    });

    it('pruning to step 0 removes all step records', () => {
      tracker.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');
      tracker.pruneToStep(0);

      expect(tracker.getSummary().totalMistakes).toBe(0);
    });
  });

  describe('4. Session Isolation & History Capping', () => {
    it('maintains strict state isolation across multiple tracker instances', () => {
      const trackerA = createSessionMistakeTracker({ repetitionThreshold: 2 });
      const trackerB = createSessionMistakeTracker({ repetitionThreshold: 2 });

      trackerA.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');
      trackerA.recordMistake(EducationalCategory.PRECEDENCE_VIOLATION, 1, '11 * 2');

      expect(trackerA.hasPattern(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(true);
      expect(trackerB.hasPattern(EducationalCategory.PRECEDENCE_VIOLATION)).toBe(false);
      expect(trackerB.getSummary().totalMistakes).toBe(0);
    });

    it('caps history length to maxHistoryLength without memory leak', () => {
      const cappedTracker = createSessionMistakeTracker({ maxHistoryLength: 5 });

      for (let i = 1; i <= 10; i++) {
        cappedTracker.recordMistake(EducationalCategory.ARITHMETIC_SLIP, 1, `attempt_${i}`);
      }

      const summary = cappedTracker.getSummary();
      expect(summary.historyCount).toBe(5);
      expect(summary.totalMistakes).toBe(5);
    });

    it('deterministic output: sequential invocations produce identical summaries', () => {
      const t1 = createSessionMistakeTracker();
      const t2 = createSessionMistakeTracker();

      t1.recordMistake(EducationalCategory.UNSUPPORTED_GROUPING, 1, '10 - 2');
      t1.recordMistake(EducationalCategory.UNSUPPORTED_GROUPING, 1, '10 - 2');

      t2.recordMistake(EducationalCategory.UNSUPPORTED_GROUPING, 1, '10 - 2');
      t2.recordMistake(EducationalCategory.UNSUPPORTED_GROUPING, 1, '10 - 2');

      expect(t1.getSummary()).toEqual(t2.getSummary());
    });
  });
});
