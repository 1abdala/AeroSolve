import { describe, it, expect } from 'vitest';
import {
  classifyStepError,
  generateProgressiveHint,
  validateParallelExample,
  EducationalCategory,
  ConfidenceLevel,
  extractASTLiterals,
  areASTsStructurallyIdentical,
} from '../services/educationalFeedback.js';
import { verifySingleStep } from '../services/solutionVerifier.js';
import { parseExpression } from '../services/expressionParser.js';

describe('AeroSolve — Educational Feedback Engine (Milestone 7.2 Phase B)', () => {
  describe('1. Mathematical Authority & Valid Step Handling', () => {
    it('correctly handles a valid single reduction step', () => {
      const prev = '2 + 3 * 4';
      const next = '2 + 12';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(true);
      expect(feedback.isComplete).toBe(false);
      expect(feedback.status).toBe('VALID');
      expect(feedback.category).toBe(EducationalCategory.NONE);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('Valid Step');
      expect(feedback.suggestedHintLevel).toBe(1);
    });

    it('correctly handles a completed final reduction step', () => {
      const prev = '2 + 12';
      const next = '14';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(true);
      expect(feedback.isComplete).toBe(true);
      expect(feedback.status).toBe('COMPLETED');
      expect(feedback.category).toBe(EducationalCategory.NONE);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('Problem Solved!');
      expect(feedback.explanation).toContain('14');
    });

    it('preserves pre-computed verificationResult without overriding it', () => {
      const prev = '2 + 3 * 4';
      const next = '2 + 12';
      const vResult = verifySingleStep(prev, next);
      const feedback = classifyStepError(prev, next, vResult);

      expect(feedback.isValid).toBe(vResult.isValid);
      expect(feedback.status).toBe(vResult.status);
    });
  });

  describe('2. Definitive Error Classifications', () => {
    it('classifies SYNTAX_ERROR with definitive confidence', () => {
      const prev = '2 + 3 * 4';
      const next = '2 + * 4';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('SYNTAX_ERROR');
      expect(feedback.category).toBe(EducationalCategory.SYNTAX_ERROR);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('Syntax Error');
      expect(feedback.remediationAdvice).toContain('parentheses');
      expect(feedback.suggestedHintLevel).toBe(1);
    });

    it('classifies EVALUATION_ERROR with definitive confidence on division by zero', () => {
      const prev = '10 + 4 / 2';
      const next = '10 + 4 / 0';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('EVALUATION_ERROR');
      expect(feedback.category).toBe(EducationalCategory.EVALUATION_ERROR);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('Calculation Error');
      expect(feedback.explanation).toContain('division by zero');
    });

    it('classifies NO_PROGRESS with definitive confidence when expression is repeated identically', () => {
      const prev = '8 + 3 * 2';
      const next = '8 + 3 * 2';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('NO_PROGRESS');
      expect(feedback.category).toBe(EducationalCategory.NO_PROGRESS);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('No Progress');
      expect(feedback.explanation).toContain('identical to the previous line');
      expect(feedback.suggestedHintLevel).toBe(1);
    });

    it('classifies STEP_SKIPPED with definitive confidence when jumping directly to final answer', () => {
      const prev = '2 + 3 * 4';
      const next = '14';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('STEP_SKIPPED');
      expect(feedback.category).toBe(EducationalCategory.STEP_SKIPPED);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('Intermediate Step Required');
      expect(feedback.remediationAdvice).toContain('one operation at a time');
      expect(feedback.suggestedHintLevel).toBe(2);
    });

    it('classifies COMPOUND_STEP with definitive confidence when combining multiple valid steps at once', () => {
      const prev = '1 + 2 * 3 + 4';
      // Step 1: 1 + 6 + 4, Step 2: 7 + 4, Step 3: 11
      // Student jumps to 1 + 10 (eliminating 2 operations at once while preserving value)
      const next = '1 + 10';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('UNVERIFIED');
      expect(feedback.category).toBe(EducationalCategory.COMPOUND_STEP);
      expect(feedback.confidence).toBe(ConfidenceLevel.DEFINITIVE);
      expect(feedback.title).toBe('Multiple Steps Combined');
      expect(feedback.explanation).toContain('operations in a single step');
      expect(feedback.suggestedHintLevel).toBe(2);
    });
  });

  describe('3. Probable Error Classifications', () => {
    it('classifies PRECEDENCE_VIOLATION when addition is performed before multiplication', () => {
      const prev = '8 + 3 * 2';
      const next = '11 * 2'; // Student calculated 8 + 3 = 11 instead of 3 * 2
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.PRECEDENCE_VIOLATION);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.title).toBe('Order of Operations Error');
      expect(feedback.explanation).toContain('PEMDAS / BODMAS');
      expect(feedback.suggestedHintLevel).toBe(2);
    });

    it('classifies PRECEDENCE_VIOLATION for naive left-to-right calculation', () => {
      const prev = '2 + 3 * 4';
      const next = '5 * 4'; // Student calculated 2 + 3 = 5 instead of 3 * 4
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.PRECEDENCE_VIOLATION);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.title).toBe('Order of Operations Error');
    });

    it('classifies ARITHMETIC_SLIP when correct operation is chosen but arithmetic calculation is wrong', () => {
      const prev = '2 + 3 * 4';
      const next = '2 + 15'; // Student targeted 3 * 4, but calculated 15 instead of 12
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.ARITHMETIC_SLIP);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.title).toBe('Calculation Slip');
      expect(feedback.explanation).toContain('3 × 4');
      expect(feedback.diagnostic.expected).toBe(12);
      expect(feedback.diagnostic.candidate).toBe(15);
      expect(feedback.suggestedHintLevel).toBe(2);
    });

    it('classifies ARITHMETIC_SLIP in multi-digit expressions', () => {
      const prev = '10 + 25 * 4';
      const next = '10 + 95'; // Student targeted 25 * 4, but calculated 95 instead of 100
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.ARITHMETIC_SLIP);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.diagnostic.expected).toBe(100);
      expect(feedback.diagnostic.candidate).toBe(95);
    });

    it('classifies SIGN_ERROR when magnitude is correct but sign is inverted', () => {
      const prev = '5 - 8';
      const next = '3'; // Expected -3, student wrote +3
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.SIGN_ERROR);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.title).toBe('Sign Error');
      expect(feedback.explanation).toContain('positive or negative sign is reversed');
      expect(feedback.suggestedHintLevel).toBe(2);
    });

    it('classifies UNSUPPORTED_GROUPING across flat subtraction chain', () => {
      const prev = '10 - 4 - 2';
      const next = '10 - 2'; // Student grouped 4 - 2 = 2, yielding 10 - 2 = 8 (expected 6 - 2 = 4)
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.UNSUPPORTED_GROUPING);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.title).toBe('Non-Associative Regrouping');
      expect(feedback.explanation).toContain('subtraction or division');
      expect(feedback.suggestedHintLevel).toBe(2);
    });

    it('classifies UNSUPPORTED_GROUPING across flat division chain', () => {
      const prev = '16 / 4 / 2';
      const next = '16 / 2'; // Student grouped 4 / 2 = 2, yielding 16 / 2 = 8 (expected 4 / 2 = 2)
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.UNSUPPORTED_GROUPING);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
      expect(feedback.title).toBe('Non-Associative Regrouping');
    });
  });

  describe('4. Ambiguous Error Classification & Neutral Fallback', () => {
    it('falls back to UNCLASSIFIED_INVALID with ambiguous confidence on arbitrary inputs', () => {
      const prev = '2 + 3 * 4';
      const next = '999 + 1';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.UNCLASSIFIED_INVALID);
      expect(feedback.confidence).toBe(ConfidenceLevel.AMBIGUOUS);
      expect(feedback.title).toBe('Incorrect Step');
      expect(feedback.suggestedHintLevel).toBe(1);
    });

    it('falls back to UNCLASSIFIED_INVALID for completely scrambled expressions', () => {
      const prev = '2 + 3 * 4';
      const next = '77 + 88';
      const feedback = classifyStepError(prev, next);

      expect(feedback.isValid).toBe(false);
      expect(feedback.status).toBe('INVALID');
      expect(feedback.category).toBe(EducationalCategory.UNCLASSIFIED_INVALID);
      expect(feedback.confidence).toBe(ConfidenceLevel.AMBIGUOUS);
    });
  });

  describe('5. Precedence vs. Arithmetic Error Discrimination', () => {
    it('reliably discriminates precedence error from arithmetic slip on the same problem', () => {
      const problem = '8 + 3 * 2';

      // Attempt A: Precedence error (evaluating 8 + 3 = 11)
      const attemptA = classifyStepError(problem, '11 * 2');
      expect(attemptA.category).toBe(EducationalCategory.PRECEDENCE_VIOLATION);
      expect(attemptA.title).toContain('Order of Operations');

      // Attempt B: Arithmetic slip (evaluating 3 * 2 = 7)
      const attemptB = classifyStepError(problem, '8 + 7');
      expect(attemptB.category).toBe(EducationalCategory.ARITHMETIC_SLIP);
      expect(attemptB.title).toContain('Calculation Slip');

      // Attempt C: Correct step (evaluating 3 * 2 = 6)
      const attemptC = classifyStepError(problem, '8 + 6');
      expect(attemptC.isValid).toBe(true);
      expect(attemptC.category).toBe(EducationalCategory.NONE);
    });
  });

  describe('6. Progressive Hint Generator (Levels 1–3)', () => {
    const expr = '8 + 3 * 2';

    it('Level 1: provides a gentle conceptual nudge with zero number spoilers', () => {
      const hint = generateProgressiveHint(expr, 1);

      expect(hint.level).toBe(1);
      expect(hint.ruleKey).toBe('PRECEDENCE_PRIORITY');
      expect(hint.title).toContain('Multiplication & Division First');
      expect(hint.targetSubexpression).toBeNull();
      expect(hint.hasParallelExample).toBe(false);
      expect(hint.parallelExample).toBeNull();
      expect(hint.antiSpoilerGuarantee).toBe(true);

      // Verify hintText does NOT leak any problem numbers (8, 3, 2), target result (6), or final answer (14)
      expect(hint.hintText).not.toContain('8');
      expect(hint.hintText).not.toContain('3');
      expect(hint.hintText).not.toContain('2');
      expect(hint.hintText).not.toContain('6');
      expect(hint.hintText).not.toContain('14');
    });

    it('Level 2: identifies target subexpression without revealing its calculated answer', () => {
      const hint = generateProgressiveHint(expr, 2);

      expect(hint.level).toBe(2);
      expect(hint.title).toBe('Target Operation');
      expect(hint.targetSubexpression).toBe('3 × 2');
      expect(hint.operator).toBe('*');
      expect(hint.hintText).toContain('3 × 2');
      expect(hint.antiSpoilerGuarantee).toBe(true);

      // ANTI-SPOILER CHECK: Must NOT contain calculated subResult (6) or final answer (14)
      expect(hint.hintText).not.toContain('6');
      expect(hint.hintText).not.toContain('14');
      expect(hint.hasParallelExample).toBe(false);
    });

    it('Level 3: explains the rule and provides a validated parallel example with disjoint numbers', () => {
      const hint = generateProgressiveHint(expr, 3);

      expect(hint.level).toBe(3);
      expect(hint.title).toBe('Rule Explanation & Example');
      expect(hint.antiSpoilerGuarantee).toBe(true);
      expect(hint.hasParallelExample).toBe(true);
      expect(hint.parallelExample).not.toBeNull();

      // Parallel example must have disjoint numbers from current problem {8, 3, 2, 6, 14}
      const forbidden = new Set([8, 3, 2, 6, 14]);
      const exNumbers = [
        ...hint.parallelExample.expression.match(/\d+/g).map(Number),
        ...hint.parallelExample.firstStep.match(/\d+/g).map(Number),
      ];
      for (const num of exNumbers) {
        expect(forbidden.has(num)).toBe(false);
      }
    });

    it('Level 3: safely falls back to non-numerical explanation when forceFallback is enabled', () => {
      const hint = generateProgressiveHint(expr, 3, { forceFallback: true });

      expect(hint.level).toBe(3);
      expect(hint.hasParallelExample).toBe(false);
      expect(hint.parallelExample).toBeNull();
      expect(hint.hintText).toContain('Rule: Always calculate operations in strict PEMDAS / BODMAS priority');
      expect(hint.antiSpoilerGuarantee).toBe(true);
    });

    it('clamps requested level to range [1, 3]', () => {
      const hintMin = generateProgressiveHint(expr, 0);
      expect(hintMin.level).toBe(1);

      const hintMax = generateProgressiveHint(expr, 5);
      expect(hintMax.level).toBe(3);
    });

    it('handles parentheses expressions properly across all 3 levels', () => {
      const pExpr = '(4 + 2) * 5';

      const h1 = generateProgressiveHint(pExpr, 1);
      expect(h1.ruleKey).toBe('PARENTHESES_FIRST');
      expect(h1.title).toContain('Parentheses');
      expect(h1.targetSubexpression).toBeNull();

      const h2 = generateProgressiveHint(pExpr, 2);
      expect(h2.targetSubexpression).toBe('4 + 2');
      // Anti-spoiler: must not reveal 6 or 30
      expect(h2.hintText).not.toContain('6');
      expect(h2.hintText).not.toContain('30');

      const h3 = generateProgressiveHint(pExpr, 3);
      expect(h3.antiSpoilerGuarantee).toBe(true);
    });

    it('handles left-to-right expressions across all 3 levels', () => {
      const lrExpr = '10 - 4 + 2';

      const h1 = generateProgressiveHint(lrExpr, 1);
      expect(h1.ruleKey).toBe('LEFT_TO_RIGHT');
      expect(h1.title).toContain('Left to Right');

      const h2 = generateProgressiveHint(lrExpr, 2);
      expect(h2.targetSubexpression).toBe('10 - 4');
      // Anti-spoiler: must not reveal 6 or 8
      expect(h2.hintText).not.toContain('8');
    });

    it('handles already simplified single literal', () => {
      const hint = generateProgressiveHint('42', 2);
      expect(hint.ruleKey).toBe('ALREADY_SIMPLIFIED');
      expect(hint.targetSubexpression).toBeNull();
    });

    it('handles invalid syntax expression gracefully in hint generator', () => {
      const hint = generateProgressiveHint('2 + *', 1);
      expect(hint.ruleKey).toBe('SYNTAX_ERROR');
      expect(hint.antiSpoilerGuarantee).toBe(true);
    });
  });

  describe('7. Parallel Example Validation Engine', () => {
    it('validates disjoint candidate numbers as safe', () => {
      const candidateNumbers = [5, 4, 7, 28, 33];
      const forbiddenNumbers = new Set([8, 3, 2, 6, 14]);

      const isValid = validateParallelExample(candidateNumbers, forbiddenNumbers);
      expect(isValid).toBe(true);
    });

    it('rejects candidate numbers when there is an overlap', () => {
      const candidateNumbers = [8, 4, 7, 28, 33]; // Overlaps with 8
      const forbiddenNumbers = new Set([8, 3, 2, 6, 14]);

      const isValid = validateParallelExample(candidateNumbers, forbiddenNumbers);
      expect(isValid).toBe(false);
    });

    it('accepts array or Set for forbiddenNumbers', () => {
      expect(validateParallelExample([5, 9], [1, 2, 3])).toBe(true);
      expect(validateParallelExample([5, 9], [5, 2, 3])).toBe(false);
    });

    it('rejects invalid or empty candidate arrays', () => {
      expect(validateParallelExample([], [1, 2, 3])).toBe(false);
      expect(validateParallelExample(null, [1, 2, 3])).toBe(false);
      expect(validateParallelExample([NaN], [1, 2, 3])).toBe(false);
    });
  });

  describe('8. AST Helper Functions & Determinism', () => {
    it('extractASTLiterals extracts all literal values from tree', () => {
      const ast = parseExpression('2 + 3 * (4 - 5)');
      const literals = extractASTLiterals(ast);
      expect(literals).toEqual([2, 3, 4, 5]);
    });

    it('areASTsStructurallyIdentical compares structure and values accurately', () => {
      const ast1 = parseExpression('2 + 3 * 4');
      const ast2 = parseExpression('2 + 3 * 4');
      const ast3 = parseExpression('2 + 3 * 5');
      const ast4 = parseExpression('2 * 3 + 4');

      expect(areASTsStructurallyIdentical(ast1, ast2)).toBe(true);
      expect(areASTsStructurallyIdentical(ast1, ast3)).toBe(false);
      expect(areASTsStructurallyIdentical(ast1, ast4)).toBe(false);
    });

    it('consistently produces deterministic results across identical invocations', () => {
      const prev = '8 + 3 * 2';
      const next = '11 * 2';

      const run1 = classifyStepError(prev, next);
      const run2 = classifyStepError(prev, next);

      expect(run1).toEqual(run2);

      const hint1 = generateProgressiveHint(prev, 3);
      const hint2 = generateProgressiveHint(prev, 3);

      expect(hint1).toEqual(hint2);
    });

    it('accepts token arrays as input for both expressions', () => {
      const prevTokens = [
        { type: 'INTEGER', value: '8' },
        { type: 'PLUS', value: '+' },
        { type: 'INTEGER', value: '3' },
        { type: 'STAR', value: '*' },
        { type: 'INTEGER', value: '2' },
      ];
      const nextTokens = [
        { type: 'INTEGER', value: '11' },
        { type: 'STAR', value: '*' },
        { type: 'INTEGER', value: '2' },
      ];

      const feedback = classifyStepError(prevTokens, nextTokens);
      expect(feedback.category).toBe(EducationalCategory.PRECEDENCE_VIOLATION);
      expect(feedback.confidence).toBe(ConfidenceLevel.PROBABLE);
    });

    it('handles deeply nested expressions with parentheses correctly', () => {
      const nested = '((2 + 3) * 4) + 5';
      const hintL1 = generateProgressiveHint(nested, 1);
      expect(hintL1.ruleKey).toBe('PARENTHESES_FIRST');

      const hintL2 = generateProgressiveHint(nested, 2);
      expect(hintL2.targetSubexpression).toBe('2 + 3');
      // Anti-spoiler: must not leak 5 or 25
      expect(hintL2.hintText).not.toContain('25');
    });

    it('anti-spoiler invariant: verifies across multiple problems that subResult and final answer are never in hintText', () => {
      const testCases = [
        { expr: '4 + 5 * 6', subResult: 30, final: 34 },
        { expr: '12 / 3 + 7', subResult: 4, final: 11 },
        { expr: '20 - 2 * 8', subResult: 16, final: 4 },
        { expr: '(7 + 3) * 4', subResult: 10, final: 40 },
        { expr: '15 - (4 + 6)', subResult: 10, final: 5 },
      ];

      for (const tc of testCases) {
        for (const lvl of [1, 2, 3]) {
          const hint = generateProgressiveHint(tc.expr, lvl);
          expect(hint.antiSpoilerGuarantee).toBe(true);
          // For level 1 and 2, ensure calculated answers are never in the hint message
          if (lvl <= 2) {
            expect(hint.hintText).not.toContain(`= ${tc.subResult}`);
            expect(hint.hintText).not.toContain(`= ${tc.final}`);
          }
        }
      }
    });
  });
});
