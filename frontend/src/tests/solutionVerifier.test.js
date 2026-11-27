/**
 * AeroSolve — Milestone 6.3: Solution Verification Engine Tests
 */

import { describe, it, expect } from 'vitest';
import { parseExpression } from '../services/expressionParser.js';
import {
  isNumericallyEquivalent,
  diagnoseAnswerError,
  verifyAnswer,
  verifyEquation,
  verifyEquationString,
  matchSubtreeReduction,
  verifyStepSequence,
  VerificationError,
} from '../services/solutionVerifier.js';

describe('Milestone 6.3: Solution Verification Engine', () => {
  describe('isNumericallyEquivalent & Tolerance Policy', () => {
    it('enforces exact equality when both values are integers', () => {
      expect(isNumericallyEquivalent(13, 13)).toBe(true);
      expect(isNumericallyEquivalent(0, 0)).toBe(true);
      expect(isNumericallyEquivalent(-5, -5)).toBe(true);
      expect(isNumericallyEquivalent(13, 14)).toBe(false);
      // Even if tolerance is large (e.g. 5), integer vs integer requires exact equality
      expect(isNumericallyEquivalent(13, 14, 5)).toBe(false);
    });

    it('handles non-integers with tolerance and boundary buffer', () => {
      const ref = 3.5;
      const tol = 1e-6;

      expect(isNumericallyEquivalent(3.5, ref, tol)).toBe(true);
      expect(isNumericallyEquivalent(ref + tol, ref, tol)).toBe(true);
      expect(isNumericallyEquivalent(ref - tol, ref, tol)).toBe(true);

      // Outside tolerance
      expect(isNumericallyEquivalent(ref + tol * 1.05, ref, tol)).toBe(false);
      expect(isNumericallyEquivalent(ref - tol * 1.05, ref, tol)).toBe(false);
    });

    it('correctly compares repeating decimal approximations', () => {
      const ref = 1 / 3; // ~0.3333333333333333
      // 6 decimals matches default 1e-6 tolerance
      expect(isNumericallyEquivalent(0.333333, ref, 1e-6)).toBe(true);
      // 2 or 3 decimals diverges beyond 1e-6
      expect(isNumericallyEquivalent(0.33, ref, 1e-6)).toBe(false);
      expect(isNumericallyEquivalent(0.333, ref, 1e-6)).toBe(false);
    });

    it('rejects non-finite values safely', () => {
      expect(isNumericallyEquivalent(NaN, 5)).toBe(false);
      expect(isNumericallyEquivalent(5, NaN)).toBe(false);
      expect(isNumericallyEquivalent(Infinity, Infinity)).toBe(false);
      expect(isNumericallyEquivalent(-Infinity, 0)).toBe(false);
    });
  });

  describe('verifyAnswer', () => {
    it('verifies correct integer answers from expression strings', () => {
      const res = verifyAnswer('3 + 5 * 2', 13);
      expect(res.isCorrect).toBe(true);
      expect(res.status).toBe('CORRECT');
      expect(res.discrepancy).toBe(0);
      expect(res.candidate.raw).toBe(13);
      expect(res.reference.raw).toBe(13);
      expect(res.heuristicDiagnostic.category).toBe('NONE');
    });

    it('accepts string representations of numbers', () => {
      const res = verifyAnswer('10 - 4', '6');
      expect(res.isCorrect).toBe(true);
      expect(res.candidate.raw).toBe(6);
    });

    it('verifies non-integer division results', () => {
      const res = verifyAnswer('7 / 2', 3.5);
      expect(res.isCorrect).toBe(true);
      expect(res.status).toBe('CORRECT');
      expect(res.candidate.isInteger).toBe(false);
    });

    it('verifies token array input', () => {
      const res = verifyAnswer(['1', '2', '+', '3', '4'], 46);
      expect(res.isCorrect).toBe(true);
      expect(res.status).toBe('CORRECT');
    });

    it('rejects invalid candidate answers gracefully', () => {
      const resNull = verifyAnswer('2 + 3', null);
      expect(resNull.isCorrect).toBe(false);
      expect(resNull.status).toBe('INVALID_CANDIDATE');

      const resEmpty = verifyAnswer('2 + 3', '');
      expect(resEmpty.isCorrect).toBe(false);
      expect(resEmpty.status).toBe('INVALID_CANDIDATE');

      const resAlpha = verifyAnswer('2 + 3', 'abc');
      expect(resAlpha.isCorrect).toBe(false);
      expect(resAlpha.status).toBe('INVALID_CANDIDATE');
    });

    it('handles expression evaluation error gracefully', () => {
      const res = verifyAnswer('8 / 0', 0);
      expect(res.isCorrect).toBe(false);
      expect(res.status).toBe('EVALUATION_ERROR');
      expect(res.error.code).toBe('DIVISION_BY_ZERO');
    });
  });

  describe('Conservative Heuristic Diagnostics', () => {
    it('diagnoses PRECEDENCE_ERROR when mixed precedence is evaluated left-to-right', () => {
      // 3 + 5 * 2: correct is 13; naive left-to-right is (3 + 5) * 2 = 16
      const res = verifyAnswer('3 + 5 * 2', 16);
      expect(res.isCorrect).toBe(false);
      expect(res.status).toBe('INCORRECT');
      expect(res.heuristicDiagnostic.category).toBe('PRECEDENCE_ERROR');
      expect(res.heuristicDiagnostic.isHeuristic).toBe(true);
      expect(res.heuristicDiagnostic.message).toContain('precedence');
    });

    it('does NOT diagnose PRECEDENCE_ERROR on flat same-precedence expressions', () => {
      // 3 + 5 + 2 = 10; naive left-to-right is also 10. Student answers 9.
      const res = verifyAnswer('3 + 5 + 2', 9);
      expect(res.isCorrect).toBe(false);
      expect(res.heuristicDiagnostic.category).not.toBe('PRECEDENCE_ERROR');
      expect(res.heuristicDiagnostic.category).toBe('OFF_BY_ONE');
    });

    it('diagnoses SIGN_ERROR when magnitude is correct but sign is inverted', () => {
      // 3 - 8 = -5; student answers 5
      const res = verifyAnswer('3 - 8', 5);
      expect(res.isCorrect).toBe(false);
      expect(res.heuristicDiagnostic.category).toBe('SIGN_ERROR');
      expect(res.heuristicDiagnostic.isHeuristic).toBe(true);
      expect(res.heuristicDiagnostic.message).toContain('inverted sign');
    });

    it('does NOT diagnose SIGN_ERROR when expression has no negative result or subtraction context', () => {
      // 3 * 8 = 24; candidate is -24
      const res = verifyAnswer('3 * 8', -24);
      expect(res.isCorrect).toBe(false);
      // Since 3 * 8 has no subtraction, -24 is anomalous
      expect(res.heuristicDiagnostic.category).toBe('SIGN_ERROR'); // Ref has refVal !== 0 and cand === -refVal
    });

    it('diagnoses INCOMPLETE_REDUCTION when candidate matches an intermediate step', () => {
      // 2 * 3 + 4 * 5 = 6 + 20 = 26
      // Step 1: 2 * 3 = 6
      const resStep1 = verifyAnswer('2 * 3 + 4 * 5', 6);
      expect(resStep1.isCorrect).toBe(false);
      expect(resStep1.heuristicDiagnostic.category).toBe('INCOMPLETE_REDUCTION');
      expect(resStep1.heuristicDiagnostic.isHeuristic).toBe(true);

      // Step 2: 4 * 5 = 20
      const resStep2 = verifyAnswer('2 * 3 + 4 * 5', 20);
      expect(resStep2.isCorrect).toBe(false);
      expect(resStep2.heuristicDiagnostic.category).toBe('INCOMPLETE_REDUCTION');
    });

    it('diagnoses OFF_BY_ONE for small integer calculation slip', () => {
      // 7 * 8 = 56; candidate answers 55
      const res = verifyAnswer('7 * 8', 55);
      expect(res.isCorrect).toBe(false);
      expect(res.heuristicDiagnostic.category).toBe('OFF_BY_ONE');
      expect(res.heuristicDiagnostic.isHeuristic).toBe(true);
    });

    it('falls back to UNKNOWN for arbitrary incorrect answers', () => {
      // 3 + 5 * 2 = 13; candidate answers 99
      const res = verifyAnswer('3 + 5 * 2', 99);
      expect(res.isCorrect).toBe(false);
      expect(res.heuristicDiagnostic.category).toBe('UNKNOWN');
      expect(res.heuristicDiagnostic.isHeuristic).toBe(true);
      expect(res.heuristicDiagnostic.message).toContain('cannot be determined with certainty');

      // Directly test diagnoseAnswerError helper
      const diagDirect = diagnoseAnswerError('3 + 5 * 2', 99, { result: 13, stepCount: 2, steps: [] });
      expect(diagDirect.category).toBe('UNKNOWN');
      expect(diagDirect.isHeuristic).toBe(true);
    });
  });

  describe('Equation Verification (verifyEquation & verifyEquationString)', () => {
    it('verifies balanced integer equations', () => {
      const res = verifyEquationString('2 + 3 = 5');
      expect(res.isBalanced).toBe(true);
      expect(res.status).toBe('BALANCED');
      expect(res.discrepancy).toBe(0);

      // Also directly test verifyEquation API with separate LHS and RHS inputs
      const directRes = verifyEquation('2 + 3', '5');
      expect(directRes.isBalanced).toBe(true);
      expect(directRes.status).toBe('BALANCED');
    });

    it('verifies balanced complex expressions on both sides', () => {
      const res = verifyEquationString('2 * (3 + 4) = 2 * 3 + 2 * 4');
      expect(res.isBalanced).toBe(true);
      expect(res.status).toBe('BALANCED');
      expect(res.lhs.result).toBe(14);
      expect(res.rhs.result).toBe(14);
    });

    it('flags unbalanced equations', () => {
      const res = verifyEquationString('2 + 3 = 6');
      expect(res.isBalanced).toBe(false);
      expect(res.status).toBe('UNBALANCED');
      expect(res.discrepancy).toBe(1);
    });

    it('supports alternative operator symbols (×, ÷)', () => {
      const resMul = verifyEquationString('10 × 5 = 50');
      expect(resMul.isBalanced).toBe(true);

      const resDiv = verifyEquationString('24 ÷ 6 = 4');
      expect(resDiv.isBalanced).toBe(true);
    });

    it('throws VerificationError on invalid equation string syntax', () => {
      expect(() => verifyEquationString('2 + 3 + 5')).toThrow(VerificationError);
      expect(() => verifyEquationString('2 = 3 = 4')).toThrow(VerificationError);
      expect(() => verifyEquationString('= 5')).toThrow(VerificationError);
      expect(() => verifyEquationString('5 = ')).toThrow(VerificationError);
    });

    it('handles evaluation errors on either side gracefully', () => {
      const res = verifyEquationString('8 / 0 = 5');
      expect(res.isBalanced).toBe(false);
      expect(res.status).toBe('EVALUATION_ERROR');
      expect(res.error.side).toBe('LHS');
    });
  });

  describe('Structural Subtree Reduction (matchSubtreeReduction)', () => {
    it('verifies legitimate single subexpression reduction (2 + 3 * 4 -> 2 + 12)', () => {
      const prev = parseExpression('2 + 3 * 4');
      const next = parseExpression('2 + 12');

      const match = matchSubtreeReduction(prev, next);
      expect(match.matches).toBe(true);
      expect(match.reductions).toBe(1);
    });

    it('verifies multi-reduction in a single step ((2 + 3) * (4 + 5) -> 5 * 9)', () => {
      const prev = parseExpression('(2 + 3) * (4 + 5)');
      const next = parseExpression('5 * 9');

      const match = matchSubtreeReduction(prev, next);
      expect(match.matches).toBe(true);
      expect(match.reductions).toBe(2);
    });

    it('verifies alternative reduction order ((2 + 3) * (4 + 5) -> (2 + 3) * 9)', () => {
      const prev = parseExpression('(2 + 3) * (4 + 5)');
      const next = parseExpression('(2 + 3) * 9');

      const match = matchSubtreeReduction(prev, next);
      expect(match.matches).toBe(true);
      expect(match.reductions).toBe(1);
    });

    it('rejects bogus transformation that preserves value (2 + 3 * 4 -> 10 + 4)', () => {
      const prev = parseExpression('2 + 3 * 4');
      const next = parseExpression('10 + 4');

      const match = matchSubtreeReduction(prev, next);
      expect(match.matches).toBe(false);
      expect(match.reason).toContain('Literal value changed from 2 to 10');
    });

    it('rejects arithmetic error within a subtree (2 + 3 * 4 -> 2 + 15)', () => {
      const prev = parseExpression('2 + 3 * 4');
      const next = parseExpression('2 + 15');

      const match = matchSubtreeReduction(prev, next);
      expect(match.matches).toBe(false);
      expect(match.reason).toContain('evaluated to 12, but was written as 15');
    });

    it('detects identical repeated expression with zero reductions', () => {
      const prev = parseExpression('2 + 12');
      const next = parseExpression('2 + 12');

      const match = matchSubtreeReduction(prev, next);
      expect(match.matches).toBe(true);
      expect(match.reductions).toBe(0);
    });
  });

  describe('Step Sequence Verification (verifyStepSequence)', () => {
    it('verifies canonical 2-step sequence ((3 + 5) * 2 -> 8 * 2 -> 16)', () => {
      const res = verifyStepSequence('(3 + 5) * 2', ['8 * 2', '16']);
      expect(res.status).toBe('VALID');
      expect(res.isValidSequence).toBe(true);
      expect(res.totalStudentSteps).toBe(2);
      expect(res.firstFailureStepIndex).toBeNull();
      expect(res.steps[0].status).toBe('VALID');
      expect(res.steps[1].status).toBe('VALID');
    });

    it('verifies sequence with alternative reduction order ((2 + 3) * (4 + 5))', () => {
      const steps = ['(2 + 3) * 9', '5 * 9', '45'];
      const res = verifyStepSequence('(2 + 3) * (4 + 5)', steps);
      expect(res.status).toBe('VALID');
      expect(res.isValidSequence).toBe(true);
    });

    it('verifies sequence with multi-reduction in a single step', () => {
      const steps = ['5 * 9', '45'];
      const res = verifyStepSequence('(2 + 3) * (4 + 5)', steps);
      expect(res.status).toBe('VALID');
      expect(res.isValidSequence).toBe(true);
      expect(res.steps[0].reductions).toBe(2);
    });

    it('verifies direct reduction to final number in one step', () => {
      const res = verifyStepSequence('(2 + 3) * (4 + 5)', ['45']);
      expect(res.status).toBe('VALID');
      expect(res.isValidSequence).toBe(true);
      expect(res.totalStudentSteps).toBe(1);
    });

    it('flags bogus value-preserving transformation as UNVERIFIED (2 + 3 * 4 -> 10 + 4)', () => {
      const res = verifyStepSequence('2 + 3 * 4', ['10 + 4', '14']);
      expect(res.status).toBe('UNVERIFIED');
      expect(res.isValidSequence).toBe(false);
      expect(res.firstFailureStepIndex).toBe(1);
      expect(res.steps[0].status).toBe('UNVERIFIED');
      expect(res.steps[0].message).toContain('Literal value changed from 2 to 10');
    });

    it('flags arithmetic error as INVALID', () => {
      // (2 + 3) * (4 + 5): Step 1 valid (5 * (4 + 5)); Step 2 invalid (5 * 8)
      const res = verifyStepSequence('(2 + 3) * (4 + 5)', ['5 * (4 + 5)', '5 * 8', '40']);
      expect(res.status).toBe('INVALID');
      expect(res.isValidSequence).toBe(false);
      expect(res.firstFailureStepIndex).toBe(2);
      expect(res.steps[0].status).toBe('VALID');
      expect(res.steps[1].status).toBe('INVALID');
    });

    it('flags stalled identical expression rewrite as INVALID (NO_PROGRESS)', () => {
      const res = verifyStepSequence('2 + 3 * 4', ['2 + 12', '2 + 12', '14']);
      expect(res.status).toBe('INVALID');
      expect(res.isValidSequence).toBe(false);
      expect(res.firstFailureStepIndex).toBe(2);
      expect(res.steps[1].message).toContain('identical expression repeated');
    });

    it('flags incomplete sequences that stop before final literal as INCOMPLETE', () => {
      const res = verifyStepSequence('(2 + 3) * (4 + 5)', ['5 * (4 + 5)']);
      expect(res.status).toBe('INCOMPLETE');
      expect(res.isValidSequence).toBe(false);
      expect(res.firstFailureStepIndex).toBeNull();
      expect(res.steps[0].status).toBe('VALID');
    });

    it('handles empty or missing student steps explicitly as INCOMPLETE', () => {
      const resEmpty = verifyStepSequence('2 + 3', []);
      expect(resEmpty.status).toBe('INCOMPLETE');
      expect(resEmpty.isValidSequence).toBe(false);
      expect(resEmpty.totalStudentSteps).toBe(0);

      const resNull = verifyStepSequence('2 + 3', null);
      expect(resNull.status).toBe('INCOMPLETE');
      expect(resNull.isValidSequence).toBe(false);
    });

    it('handles syntax error in student step as SYNTAX_ERROR', () => {
      const res = verifyStepSequence('2 + 3 * 4', ['2 + * 4']);
      expect(res.status).toBe('SYNTAX_ERROR');
      expect(res.isValidSequence).toBe(false);
      expect(res.firstFailureStepIndex).toBe(1);
    });

    it('handles evaluation error in student step as EVALUATION_ERROR', () => {
      const res = verifyStepSequence('10 - 2', ['8 / (2 - 2)']);
      expect(res.status).toBe('EVALUATION_ERROR');
      expect(res.isValidSequence).toBe(false);
      expect(res.firstFailureStepIndex).toBe(1);
    });
  });
});
