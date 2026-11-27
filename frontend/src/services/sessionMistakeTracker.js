/**
 * AeroSolve — Milestone 7.2: Session-Local Mistake Tracker
 *
 * Implements an isolated, in-memory, deterministic service that tracks student
 * mistake patterns during an active practice problem session.
 *
 * Scope & Guarantees:
 * 1. Session-Local Only: Completely ephemeral in memory. ZERO persistence in
 *    localStorage, sessionStorage, cookies, IndexedDB, or backend APIs.
 * 2. Privacy & Dignity: Collects no personal data or student profiles; purpose is
 *    solely to provide supportive real-time guidance during the active problem.
 * 3. Determinism: Uses sequential attempt counts rather than wall-clock timestamps.
 * 4. Adaptive Insights: Identifies repeated error patterns (e.g. repeated precedence
 *    violations or calculation slips) and provides encouraging pedagogical recommendations.
 * 5. Lifecycle Management: Supports clean resets on problem change, problem restart,
 *    and precise undo pruning.
 */

import { EducationalCategory } from './educationalFeedback.js';

/**
 * Default configuration options for the mistake tracker.
 */
export const DEFAULT_TRACKER_OPTIONS = Object.freeze({
  repetitionThreshold: 2,
  maxHistoryLength: 20,
});

/**
 * Pedagogical pattern insights mapped by error category.
 */
const PATTERN_INSIGHTS = {
  [EducationalCategory.PRECEDENCE_VIOLATION]: {
    title: 'Order of Operations Pattern',
    supportiveMessage:
      'You have encountered order-of-operation hurdles on this problem. Remember that multiplication and division take priority over addition and subtraction (PEMDAS / BODMAS). Check the hint for step-by-step guidance!',
    recommendedHintLevel: 2,
  },
  [EducationalCategory.ARITHMETIC_SLIP]: {
    title: 'Calculation Slip Pattern',
    supportiveMessage:
      'Your order of operations is right on track! A few small arithmetic slips have occurred. Take a moment to double-check basic multiplication or addition before checking your step.',
    recommendedHintLevel: 2,
  },
  [EducationalCategory.SIGN_ERROR]: {
    title: 'Sign Check Pattern',
    supportiveMessage:
      'Signs can be tricky when subtracting or working with negative numbers. Double-check whether your subexpression should evaluate to a positive or negative value.',
    recommendedHintLevel: 2,
  },
  [EducationalCategory.UNSUPPORTED_GROUPING]: {
    title: 'Regrouping Rule Pattern',
    supportiveMessage:
      'Regrouping works for addition and multiplication, but not across subtraction or division. Calculate non-associative operations strictly from left to right.',
    recommendedHintLevel: 2,
  },
  [EducationalCategory.COMPOUND_STEP]: {
    title: 'Pacing Pattern: One Step at a Time',
    supportiveMessage:
      'You are solving operations quickly! In step-by-step learning mode, solving just one operation per line ensures every intermediate step is clearly shown.',
    recommendedHintLevel: 2,
  },
  [EducationalCategory.STEP_SKIPPED]: {
    title: 'Pacing Pattern: Show Your Work',
    supportiveMessage:
      'Directly submitting final answers skips the intermediate reasoning. Break the problem down into individual operation reductions.',
    recommendedHintLevel: 2,
  },
};

/**
 * Factory function creating an isolated in-memory session mistake tracker.
 *
 * @param {object} [options] - Tracker configuration options
 * @param {number} [options.repetitionThreshold=2] - Number of occurrences before a pattern is flagged
 * @param {number} [options.maxHistoryLength=20] - Max attempt records retained in memory
 * @returns {object} SessionMistakeTracker instance
 */
export function createSessionMistakeTracker(options = {}) {
  const threshold = options.repetitionThreshold ?? DEFAULT_TRACKER_OPTIONS.repetitionThreshold;
  const maxHistory = options.maxHistoryLength ?? DEFAULT_TRACKER_OPTIONS.maxHistoryLength;

  let attemptCounter = 0;
  let history = [];
  let categoryCounts = {};

  /**
   * Recompute category counts from the current history array.
   */
  function recomputeCounts() {
    const counts = {};
    for (const item of history) {
      if (item.category && item.category !== EducationalCategory.NONE) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    }
    categoryCounts = counts;
  }

  /**
   * Find the primary pattern insight based on current category counts.
   *
   * @returns {object | null}
   */
  function computePrimaryPattern() {
    let topCategory = null;
    let maxCount = 0;

    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count >= threshold && count > maxCount) {
        // Exclude ambiguous categories from triggering specific pattern insights
        if (cat !== EducationalCategory.UNCLASSIFIED_INVALID) {
          maxCount = count;
          topCategory = cat;
        }
      }
    }

    if (!topCategory) return null;

    const template = PATTERN_INSIGHTS[topCategory] || {
      title: 'Helpful Tip',
      supportiveMessage:
        'Take your time to review the previous expression. The Hint button can help clarify which operation to simplify next.',
      recommendedHintLevel: 1,
    };

    return {
      category: topCategory,
      count: maxCount,
      title: template.title,
      supportiveMessage: template.supportiveMessage,
      recommendedHintLevel: template.recommendedHintLevel,
    };
  }

  return {
    /**
     * Record a classified mistake event for the active problem.
     *
     * @param {string} category - Educational error category
     * @param {number} [stepIndex=1] - Current step index
     * @param {string} [candidateExpr=''] - Submitted candidate expression string
     * @returns {object} Updated tracker summary
     */
    recordMistake(category, stepIndex = 1, candidateExpr = '') {
      if (!category || category === EducationalCategory.NONE) {
        return this.getSummary();
      }

      attemptCounter += 1;
      const event = {
        attemptIndex: attemptCounter,
        category,
        stepIndex: Math.max(1, Number(stepIndex) || 1),
        candidateExpr: String(candidateExpr || ''),
      };

      history.push(event);
      if (history.length > maxHistory) {
        history.shift();
      }

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      return this.getSummary();
    },

    /**
     * Prune tracked mistakes when the student undoes to a previous step.
     * Removes mistakes that occurred on steps > targetStepIndex.
     *
     * @param {number} targetStepIndex - Step index to prune after
     * @returns {object} Updated tracker summary
     */
    pruneToStep(targetStepIndex) {
      const target = Math.max(0, Number(targetStepIndex) || 0);
      history = history.filter((item) => item.stepIndex <= target);
      recomputeCounts();
      return this.getSummary();
    },

    /**
     * Clear all mistake records for the current problem session.
     * Called on problem change, problem restart, or problem completion.
     */
    reset() {
      attemptCounter = 0;
      history = [];
      categoryCounts = {};
    },

    /**
     * Get a comprehensive, deterministic summary of mistake patterns.
     *
     * @returns {object}
     */
    getSummary() {
      const repeatedCategories = Object.entries(categoryCounts)
        .filter(([, count]) => count >= threshold)
        .map(([cat]) => cat);

      const patternInsight = computePrimaryPattern();

      return {
        totalMistakes: history.length,
        categoryCounts: { ...categoryCounts },
        repeatedCategories,
        primaryPattern: patternInsight ? patternInsight.category : null,
        patternInsight,
        historyCount: history.length,
      };
    },

    /**
     * Get current count for a specific error category.
     *
     * @param {string} category
     * @returns {number}
     */
    getCount(category) {
      return categoryCounts[category] || 0;
    },

    /**
     * Check whether a specific category has reached the repetition threshold.
     *
     * @param {string} category
     * @returns {boolean}
     */
    hasPattern(category) {
      return (categoryCounts[category] || 0) >= threshold;
    },
  };
}
