/**
 * AeroSolve — Milestone 6.3: Solution Verification Engine
 *
 * Implements a standalone deterministic mathematical verification service that:
 * 1. Verifies candidate final numerical answers against ground-truth evaluations (verifyAnswer).
 * 2. Verifies mathematical equality between evaluable arithmetic expressions (verifyEquation, verifyEquationString).
 * 3. Verifies student step-by-step expression transformations using structural AST subtree reduction matching (verifyStepSequence).
 * 4. Employs a formal numerical tolerance policy and conservative, heuristic misconception diagnostics.
 *
 * Scope & Guarantees:
 * - Structural Subexpression Reduction: Validates step transitions using AST subtree matching,
 *   rejecting spurious transformations that merely preserve numerical value (e.g. 2 + 3 * 4 -> 10 + 4).
 * - Order & Multi-Reduction Independence: Accepts legitimate alternative reduction orders and
 *   multiple simultaneous independent reductions within a single step.
 * - Semantic Statuses: Strictly distinguishes VALID, INVALID, UNVERIFIED, INCOMPLETE,
 *   SYNTAX_ERROR, and EVALUATION_ERROR.
 * - Value vs. Display: Correctness is determined exclusively via native IEEE 754 numerical values;
 *   formatted strings are strictly presentation-only.
 * - Purity: Reuses M6.1 and M6.2 without modifying them. Zero algebraic variables, zero UI dependencies.
 */

import { parseExpression, tokenize, TokenType } from './expressionParser.js';
import {
  evaluateAST,
  formatDisplayNumber,
  astToInfix,
  cloneAST,
} from './expressionEvaluator.js';

/**
 * Custom Verification Error carrying error code and context details.
 */
export class VerificationError extends Error {
  constructor(message, code = 'VERIFICATION_ERROR', details = {}) {
    super(message);
    this.name = 'VerificationError';
    this.code = code;
    this.details = details;
  }
}

const EPSILON = Number.EPSILON;

/**
 * Determine whether candidateVal is numerically equivalent to referenceVal under the formal policy.
 *
 * - Non-finite values are rejected.
 * - If both candidateVal and referenceVal are integers, exact equality is enforced (tolerance = 0).
 * - If non-integers are involved, values must match within tolerance with an EPSILON buffer.
 *
 * @param {number} candidateVal - Candidate numerical value
 * @param {number} referenceVal - Ground truth numerical value
 * @param {number} [tolerance=1e-6] - Numerical tolerance for floating-point values
 * @returns {boolean} True if equivalent, false otherwise
 */
export function isNumericallyEquivalent(candidateVal, referenceVal, tolerance = 1e-6) {
  if (typeof candidateVal !== 'number' || typeof referenceVal !== 'number') {
    return false;
  }
  if (!Number.isFinite(candidateVal) || !Number.isFinite(referenceVal)) {
    return false;
  }

  // Exact match (identical integers, exact floats, and +/-0 normalization)
  if (candidateVal === referenceVal) {
    return true;
  }

  // Integer policy: If both are integers, require exact equality
  if (Number.isInteger(candidateVal) && Number.isInteger(referenceVal)) {
    return false;
  }

  // Floating-point policy: Absolute difference with EPSILON buffer
  const diff = Math.abs(candidateVal - referenceVal);
  return diff <= (tolerance + EPSILON);
}

/**
 * Resolve an input into an AST node. Accepts AST objects, math strings, or token arrays.
 *
 * @param {object | string | Array} input - AST, expression string, or token array
 * @returns {object} AST root node
 */
function resolveAST(input) {
  if (!input) {
    throw new VerificationError('Expression input cannot be null or undefined', 'EMPTY_INPUT');
  }
  if (typeof input === 'object' && !Array.isArray(input) && typeof input.type === 'string') {
    return cloneAST(input);
  }
  return parseExpression(input);
}

/**
 * Compute the naive left-to-right evaluation of an expression ignoring operator precedence.
 * Used exclusively as an evidentiary prerequisite for PRECEDENCE_ERROR heuristic diagnosis.
 *
 * @param {string | Array} expressionInput - Expression string or token array
 * @returns {number | null} Evaluated left-to-right number, or null if unparseable
 */
function computeNaiveLeftToRight(expressionInput) {
  try {
    const tokens = tokenize(expressionInput);
    const nonEof = tokens.filter((t) => t.type !== TokenType.EOF);
    if (nonEof.length === 0) return null;

    // Check if tokens contain parentheses; naive left-to-right check is for flat expressions
    const hasParens = nonEof.some((t) => t.type === TokenType.LPAREN || t.type === TokenType.RPAREN);
    if (hasParens) {
      return null;
    }

    let acc = null;
    let pendingOp = null;

    for (const tok of nonEof) {
      if (tok.type === TokenType.INTEGER) {
        if (acc === null) {
          acc = tok.value;
        } else if (pendingOp) {
          switch (pendingOp) {
            case '+':
              acc += tok.value;
              break;
            case '-':
              acc -= tok.value;
              break;
            case '*':
              acc *= tok.value;
              break;
            case '/':
              if (tok.value === 0) return null;
              acc /= tok.value;
              break;
            default:
              return null;
          }
          pendingOp = null;
        } else {
          return null;
        }
      } else if ([TokenType.PLUS, TokenType.MINUS, TokenType.STAR, TokenType.SLASH].includes(tok.type)) {
        pendingOp = tok.value;
      } else {
        return null;
      }
    }

    return acc;
  } catch {
    return null;
  }
}

/**
 * Perform conservative, heuristic diagnosis when a candidate answer is incorrect.
 *
 * Adheres strictly to the diagnostic reliability policy:
 * - Assigns specific categories only when strict prerequisite evidentiary conditions are satisfied.
 * - Always flags isHeuristic: true.
 * - Falls back to UNKNOWN when evidence is ambiguous or absent.
 *
 * @param {object | string | Array} expressionInput - Expression input
 * @param {number} candidateVal - Student's candidate value
 * @param {object} referenceEval - Ground truth evaluation result from M6.2
 * @param {number} tolerance - Comparison tolerance
 * @returns {{ category: string, isHeuristic: boolean, message: string, details?: object }}
 */
export function diagnoseAnswerError(expressionInput, candidateVal, referenceEval, tolerance = 1e-6) {
  const refVal = referenceEval.result;

  // 1. Check for PRECEDENCE_ERROR
  // Prerequisite: Expression has mixed operator precedence, and naive left-to-right matches candidateVal
  try {
    const ast = resolveAST(expressionInput);
    const operators = new Set();
    const collectOperators = (node) => {
      if (node && node.type === 'BinaryExpression') {
        operators.add(node.operator);
        collectOperators(node.left);
        collectOperators(node.right);
      }
    };
    collectOperators(ast);

    const hasLowPrec = operators.has('+') || operators.has('-');
    const hasHighPrec = operators.has('*') || operators.has('/');

    if (hasLowPrec && hasHighPrec) {
      const naiveL2R = computeNaiveLeftToRight(expressionInput);
      if (naiveL2R !== null && isNumericallyEquivalent(candidateVal, naiveL2R, tolerance) && !isNumericallyEquivalent(candidateVal, refVal, tolerance)) {
        return {
          category: 'PRECEDENCE_ERROR',
          isHeuristic: true,
          message: 'Candidate answer matches naive left-to-right evaluation; multiplication/division precedence was likely overlooked.',
          details: { naiveL2RResult: naiveL2R, expectedResult: refVal },
        };
      }
    }
  } catch {
    // Ignore AST inspection failure and continue to other checks
  }

  // 2. Check for SIGN_ERROR
  // Prerequisite: Candidate is exact negative of reference (reference !== 0), and expression involves subtraction/negatives
  if (refVal !== 0 && isNumericallyEquivalent(candidateVal, -refVal, tolerance)) {
    return {
      category: 'SIGN_ERROR',
      isHeuristic: true,
      message: 'Candidate answer has the correct numerical magnitude but an inverted sign.',
      details: { expectedSign: refVal > 0 ? '+' : '-', candidateSign: candidateVal > 0 ? '+' : '-' },
    };
  }

  // 3. Check for INCOMPLETE_REDUCTION
  // Prerequisite: Expression requires > 1 steps, and candidate matches intermediate subResult (not equal to final)
  if (referenceEval.stepCount > 1 && Array.isArray(referenceEval.steps)) {
    for (const step of referenceEval.steps) {
      if (step.stepIndex < referenceEval.stepCount) {
        if (isNumericallyEquivalent(candidateVal, step.subResult, tolerance) && !isNumericallyEquivalent(candidateVal, refVal, tolerance)) {
          return {
            category: 'INCOMPLETE_REDUCTION',
            isHeuristic: true,
            message: `Candidate answer matches intermediate step ${step.stepIndex} (${step.operation}), but the expression is not fully evaluated.`,
            details: { matchedStepIndex: step.stepIndex, intermediateSubResult: step.subResult },
          };
        }
      }
    }
  }

  // 4. Check for OFF_BY_ONE
  // Prerequisite: Both candidate and reference are integers, diff === 1
  if (Number.isInteger(candidateVal) && Number.isInteger(refVal) && Math.abs(candidateVal - refVal) === 1) {
    return {
      category: 'OFF_BY_ONE',
      isHeuristic: true,
      message: 'Candidate answer is off by 1 from the correct integer result.',
      details: { candidateVal, refVal, difference: candidateVal - refVal },
    };
  }

  // 5. Neutral Fallback: UNKNOWN
  return {
    category: 'UNKNOWN',
    isHeuristic: true,
    message: 'Candidate answer diverges from reference result; specific mathematical misconception cannot be determined with certainty.',
    details: { discrepancy: Math.abs(candidateVal - refVal) },
  };
}

/**
 * Verify a candidate final numerical answer against an expression.
 *
 * @param {object | string | Array} expressionInput - Expression input
 * @param {number | string} candidateAnswer - Candidate answer
 * @param {object} [options] - Verification options
 * @param {number} [options.tolerance=1e-6] - Tolerance for non-integer comparisons
 * @param {boolean} [options.diagnose=true] - Whether to perform heuristic misconception diagnosis
 * @param {number} [options.maxDecimals=6] - Max decimal places for display formatting
 * @returns {object} AnswerVerificationResult
 */
export function verifyAnswer(expressionInput, candidateAnswer, options = {}) {
  const tolerance = options.tolerance ?? 1e-6;
  const maxDecimals = options.maxDecimals ?? 6;
  const diagnose = options.diagnose ?? true;

  // 1. Resolve and evaluate reference expression
  let referenceEval;
  try {
    const ast = resolveAST(expressionInput);
    referenceEval = evaluateAST(ast, { maxDecimals });
  } catch (err) {
    return {
      isCorrect: false,
      status: 'EVALUATION_ERROR',
      candidate: null,
      reference: null,
      discrepancy: null,
      tolerance,
      heuristicDiagnostic: null,
      error: {
        code: err.code || 'EVALUATION_ERROR',
        message: err.message,
      },
    };
  }

  // 2. Parse candidate answer
  if (candidateAnswer === null || candidateAnswer === undefined) {
    return {
      isCorrect: false,
      status: 'INVALID_CANDIDATE',
      candidate: null,
      reference: {
        raw: referenceEval.result,
        formatted: referenceEval.formattedResult,
        isInteger: referenceEval.isInteger,
        stepCount: referenceEval.stepCount,
        steps: referenceEval.steps,
      },
      discrepancy: null,
      tolerance,
      heuristicDiagnostic: null,
      error: {
        code: 'MISSING_CANDIDATE',
        message: 'Candidate answer cannot be null or undefined.',
      },
    };
  }

  let candidateVal;
  if (typeof candidateAnswer === 'number') {
    candidateVal = candidateAnswer;
  } else if (typeof candidateAnswer === 'string') {
    const trimmed = candidateAnswer.trim();
    if (trimmed.length === 0) {
      return {
        isCorrect: false,
        status: 'INVALID_CANDIDATE',
        candidate: null,
        reference: {
          raw: referenceEval.result,
          formatted: referenceEval.formattedResult,
          isInteger: referenceEval.isInteger,
          stepCount: referenceEval.stepCount,
          steps: referenceEval.steps,
        },
        discrepancy: null,
        tolerance,
        heuristicDiagnostic: null,
        error: {
          code: 'EMPTY_CANDIDATE',
          message: 'Candidate answer string is empty.',
        },
      };
    }
    candidateVal = Number(trimmed);
  } else {
    return {
      isCorrect: false,
      status: 'INVALID_CANDIDATE',
      candidate: null,
      reference: {
        raw: referenceEval.result,
        formatted: referenceEval.formattedResult,
        isInteger: referenceEval.isInteger,
        stepCount: referenceEval.stepCount,
        steps: referenceEval.steps,
      },
      discrepancy: null,
      tolerance,
      heuristicDiagnostic: null,
      error: {
        code: 'INVALID_CANDIDATE_TYPE',
        message: `Candidate answer must be a number or numeric string; received ${typeof candidateAnswer}.`,
      },
    };
  }

  if (isNaN(candidateVal) || !Number.isFinite(candidateVal)) {
    return {
      isCorrect: false,
      status: 'INVALID_CANDIDATE',
      candidate: {
        raw: candidateVal,
        formatted: String(candidateAnswer),
        isInteger: false,
      },
      reference: {
        raw: referenceEval.result,
        formatted: referenceEval.formattedResult,
        isInteger: referenceEval.isInteger,
        stepCount: referenceEval.stepCount,
        steps: referenceEval.steps,
      },
      discrepancy: null,
      tolerance,
      heuristicDiagnostic: null,
      error: {
        code: 'NON_NUMERIC_CANDIDATE',
        message: `Candidate answer "${candidateAnswer}" could not be parsed as a finite number.`,
      },
    };
  }

  // 3. Evaluate numerical correctness
  const isCorrect = isNumericallyEquivalent(candidateVal, referenceEval.result, tolerance);
  const discrepancy = Math.abs(candidateVal - referenceEval.result);

  let heuristicDiagnostic = null;
  if (!isCorrect && diagnose) {
    heuristicDiagnostic = diagnoseAnswerError(expressionInput, candidateVal, referenceEval, tolerance);
  } else if (isCorrect) {
    heuristicDiagnostic = {
      category: 'NONE',
      isHeuristic: false,
      message: 'Candidate answer is mathematically correct.',
    };
  }

  return {
    isCorrect,
    status: isCorrect ? 'CORRECT' : 'INCORRECT',
    candidate: {
      raw: candidateVal,
      formatted: formatDisplayNumber(candidateVal, maxDecimals),
      isInteger: Number.isInteger(candidateVal),
    },
    reference: {
      raw: referenceEval.result,
      formatted: referenceEval.formattedResult,
      isInteger: referenceEval.isInteger,
      stepCount: referenceEval.stepCount,
      steps: referenceEval.steps,
    },
    discrepancy,
    tolerance,
    heuristicDiagnostic,
  };
}

/**
 * Verify mathematical equivalence between two evaluable arithmetic expressions (LHS and RHS).
 *
 * @param {object | string | Array} lhsInput - Left-hand side expression
 * @param {object | string | Array} rhsInput - Right-hand side expression
 * @param {object} [options] - Verification options
 * @param {number} [options.tolerance=1e-6] - Comparison tolerance
 * @param {number} [options.maxDecimals=6] - Max decimals for formatting
 * @returns {object} EquationVerificationResult
 */
export function verifyEquation(lhsInput, rhsInput, options = {}) {
  const tolerance = options.tolerance ?? 1e-6;
  const maxDecimals = options.maxDecimals ?? 6;

  let lhsEval;
  try {
    const lhsAST = resolveAST(lhsInput);
    lhsEval = evaluateAST(lhsAST, { maxDecimals });
  } catch (err) {
    return {
      isBalanced: false,
      status: 'EVALUATION_ERROR',
      lhs: null,
      rhs: null,
      discrepancy: null,
      tolerance,
      message: `Failed to evaluate left-hand side: ${err.message}`,
      error: { side: 'LHS', code: err.code || 'EVALUATION_ERROR', message: err.message },
    };
  }

  let rhsEval;
  try {
    const rhsAST = resolveAST(rhsInput);
    rhsEval = evaluateAST(rhsAST, { maxDecimals });
  } catch (err) {
    return {
      isBalanced: false,
      status: 'EVALUATION_ERROR',
      lhs: {
        expression: lhsEval.expression,
        result: lhsEval.result,
        formattedResult: lhsEval.formattedResult,
      },
      rhs: null,
      discrepancy: null,
      tolerance,
      message: `Failed to evaluate right-hand side: ${err.message}`,
      error: { side: 'RHS', code: err.code || 'EVALUATION_ERROR', message: err.message },
    };
  }

  const isBalanced = isNumericallyEquivalent(lhsEval.result, rhsEval.result, tolerance);
  const discrepancy = Math.abs(lhsEval.result - rhsEval.result);

  return {
    isBalanced,
    status: isBalanced ? 'BALANCED' : 'UNBALANCED',
    lhs: {
      expression: lhsEval.expression,
      result: lhsEval.result,
      formattedResult: lhsEval.formattedResult,
    },
    rhs: {
      expression: rhsEval.expression,
      result: rhsEval.result,
      formattedResult: rhsEval.formattedResult,
    },
    discrepancy,
    tolerance,
    message: isBalanced
      ? `Equation is balanced: LHS and RHS both evaluate to ${lhsEval.formattedResult}.`
      : `Equation is unbalanced: LHS evaluates to ${lhsEval.formattedResult}, but RHS evaluates to ${rhsEval.formattedResult}.`,
  };
}

/**
 * Convenience entry point: Verify an equation string containing an equals sign (e.g. "2 + 3 = 5").
 *
 * @param {string} equationStr - String containing an equals sign
 * @param {object} [options] - Verification options
 * @returns {object} EquationVerificationResult
 */
export function verifyEquationString(equationStr, options = {}) {
  if (typeof equationStr !== 'string') {
    throw new VerificationError('Equation input must be a string', 'INVALID_EQUATION_INPUT');
  }

  const parts = equationStr.split('=');
  if (parts.length !== 2) {
    throw new VerificationError(
      `Equation string must contain exactly one "=" delimiter; found ${parts.length - 1}`,
      'INVALID_EQUATION_STRING',
      { equationStr, delimiterCount: parts.length - 1 }
    );
  }

  const lhsStr = parts[0].trim();
  const rhsStr = parts[1].trim();

  if (lhsStr.length === 0 || rhsStr.length === 0) {
    throw new VerificationError(
      'Equation string must have non-empty expressions on both sides of "="',
      'INVALID_EQUATION_STRING',
      { lhsStr, rhsStr }
    );
  }

  return verifyEquation(lhsStr, rhsStr, options);
}

/**
 * Recursively verifies whether nextNode is derived from prevNode by replacing
 * one or more subtrees with their evaluated numerical literal values.
 *
 * Guarantees:
 * - Unreduced branches must remain structurally and numerically identical.
 * - Subtree reductions must equal their evaluated arithmetic subresult.
 * - Multi-reductions in independent branches are supported.
 * - Alternative reduction orders are supported.
 *
 * @param {object} prevNode - AST node from S_{k-1}
 * @param {object} nextNode - AST node from S_k
 * @param {number} [tolerance=1e-6] - Numerical tolerance
 * @returns {{ matches: boolean, reductions: number, reason?: string }}
 */
export function matchSubtreeReduction(prevNode, nextNode, tolerance = 1e-6) {
  if (!prevNode || !nextNode || typeof prevNode !== 'object' || typeof nextNode !== 'object') {
    return {
      matches: false,
      reductions: 0,
      reason: 'Invalid or missing AST node in subtree comparison',
    };
  }

  // Case 1: Both nodes are identical Literals (unreduced leaf)
  if (prevNode.type === 'Literal' && nextNode.type === 'Literal') {
    if (isNumericallyEquivalent(prevNode.value, nextNode.value, tolerance)) {
      return { matches: true, reductions: 0 };
    }
    return {
      matches: false,
      reductions: 0,
      reason: `Literal value changed from ${prevNode.value} to ${nextNode.value} without an operation`,
    };
  }

  // Case 2: nextNode is a Literal, but prevNode was a BinaryExpression (Subtree Reduction)
  if (prevNode.type === 'BinaryExpression' && nextNode.type === 'Literal') {
    let evalResult;
    try {
      evalResult = evaluateAST(prevNode);
    } catch (err) {
      return {
        matches: false,
        reductions: 0,
        reason: `Evaluation of subtree failed: ${err.message}`,
      };
    }

    if (isNumericallyEquivalent(nextNode.value, evalResult.result, tolerance)) {
      return {
        matches: true,
        reductions: 1,
        reducedSubtree: prevNode,
        subResult: nextNode.value,
      };
    } else {
      return {
        matches: false,
        reductions: 0,
        reason: `Subtree (${astToInfix(prevNode)}) evaluated to ${evalResult.formattedResult}, but was written as ${nextNode.value}`,
      };
    }
  }

  // Case 3: Both nodes are BinaryExpressions
  if (prevNode.type === 'BinaryExpression' && nextNode.type === 'BinaryExpression') {
    if (prevNode.operator !== nextNode.operator) {
      return {
        matches: false,
        reductions: 0,
        reason: `Operator changed from "${prevNode.operator}" to "${nextNode.operator}" without reduction`,
      };
    }

    // Recursively verify left child
    const leftMatch = matchSubtreeReduction(prevNode.left, nextNode.left, tolerance);
    if (!leftMatch.matches) {
      return leftMatch;
    }

    // Recursively verify right child
    const rightMatch = matchSubtreeReduction(prevNode.right, nextNode.right, tolerance);
    if (!rightMatch.matches) {
      return rightMatch;
    }

    return {
      matches: true,
      reductions: leftMatch.reductions + rightMatch.reductions,
    };
  }

  // Case 4: Incompatible node types
  return {
    matches: false,
    reductions: 0,
    reason: `Incompatible transformation from "${prevNode.type}" to "${nextNode.type}"`,
  };
}

/**
 * Verify a student's sequence of complete rewritten expressions against an initial problem.
 *
 * Implements the agreed 6 status semantics:
 * - VALID: Verified legitimate arithmetic subexpression reduction.
 * - INVALID: Mathematically incorrect (value changed, invalid subexpression math).
 * - UNVERIFIED: Overall value preserved, but transition cannot be verified as direct reduction.
 * - INCOMPLETE: Valid reductions so far, but sequence terminated before single literal.
 * - SYNTAX_ERROR: Step cannot be parsed under M6.1 grammar.
 * - EVALUATION_ERROR: Step caused runtime evaluation failure (division by zero, overflow).
 *
 * @param {object | string | Array} initialExpression - Problem expression
 * @param {Array<string | object>} studentSteps - Array of complete rewritten expression steps
 * @param {object} [options] - Verification options
 * @param {number} [options.tolerance=1e-6] - Numerical tolerance
 * @param {number} [options.maxDecimals=6] - Formatting decimals
 * @returns {object} StepSequenceVerificationResult
 */
export function verifyStepSequence(initialExpression, studentSteps, options = {}) {
  const tolerance = options.tolerance ?? 1e-6;
  const maxDecimals = options.maxDecimals ?? 6;

  // 1. Evaluate reference initial expression
  let referenceEval;
  let initialAST;
  try {
    initialAST = resolveAST(initialExpression);
    referenceEval = evaluateAST(initialAST, { maxDecimals });
  } catch (err) {
    return {
      status: 'EVALUATION_ERROR',
      isValidSequence: false,
      totalStudentSteps: 0,
      firstFailureStepIndex: null,
      steps: [],
      referenceEvaluation: null,
      message: `Failed to evaluate initial expression: ${err.message}`,
      error: { code: err.code || 'EVALUATION_ERROR', message: err.message },
    };
  }

  // 2. Explicit handling of missing or empty student steps
  if (!Array.isArray(studentSteps) || studentSteps.length === 0) {
    return {
      status: 'INCOMPLETE',
      isValidSequence: false,
      totalStudentSteps: 0,
      firstFailureStepIndex: null,
      steps: [],
      referenceEvaluation: {
        result: referenceEval.result,
        formattedResult: referenceEval.formattedResult,
        stepCount: referenceEval.stepCount,
      },
      message: 'No student steps were submitted; sequence is incomplete.',
    };
  }

  let currentAST = initialAST;
  let currentVal = referenceEval.result;
  const verifiedSteps = [];
  let sequenceStatus = 'VALID';
  let firstFailureIndex = null;

  for (let i = 0; i < studentSteps.length; i++) {
    const stepIndex = i + 1;
    const rawStep = studentSteps[i];
    const stepExpr = typeof rawStep === 'object' && rawStep !== null && rawStep.expression
      ? rawStep.expression
      : rawStep;

    // A. Parse student step
    let stepAST;
    try {
      stepAST = resolveAST(stepExpr);
    } catch (parseErr) {
      verifiedSteps.push({
        stepIndex,
        expression: String(stepExpr),
        status: 'SYNTAX_ERROR',
        reductions: 0,
        result: null,
        message: `Syntax error in step ${stepIndex}: ${parseErr.message}`,
      });
      sequenceStatus = 'SYNTAX_ERROR';
      firstFailureIndex = stepIndex;
      break;
    }

    // B. Evaluate student step
    let stepEval;
    try {
      stepEval = evaluateAST(stepAST, { maxDecimals });
    } catch (evalErr) {
      verifiedSteps.push({
        stepIndex,
        expression: astToInfix(stepAST),
        status: 'EVALUATION_ERROR',
        reductions: 0,
        result: null,
        message: `Evaluation error in step ${stepIndex}: ${evalErr.message}`,
      });
      sequenceStatus = 'EVALUATION_ERROR';
      firstFailureIndex = stepIndex;
      break;
    }

    // C. Structural Subtree Reduction Verification
    const match = matchSubtreeReduction(currentAST, stepAST, tolerance);

    if (match.matches) {
      if (match.reductions > 0) {
        // Legitimate arithmetic reduction!
        verifiedSteps.push({
          stepIndex,
          expression: astToInfix(stepAST),
          status: 'VALID',
          reductions: match.reductions,
          result: stepEval.result,
          message: `Legitimate reduction: ${match.reductions} subexpression(s) reduced.`,
        });
        currentAST = stepAST;
        currentVal = stepEval.result;
      } else {
        // Reductions === 0: identical expression repeated
        verifiedSteps.push({
          stepIndex,
          expression: astToInfix(stepAST),
          status: 'INVALID',
          reductions: 0,
          result: stepEval.result,
          message: `No progress made in step ${stepIndex}: identical expression repeated without reduction.`,
        });
        sequenceStatus = 'INVALID';
        firstFailureIndex = stepIndex;
        break;
      }
    } else {
      // Subtree reduction match failed
      // Check if overall numerical value was preserved
      const valuePreserved = isNumericallyEquivalent(stepEval.result, currentVal, tolerance);

      if (valuePreserved) {
        // Preserved value but transformation is not a verified subexpression reduction (e.g. 2 + 3 * 4 -> 10 + 4)
        verifiedSteps.push({
          stepIndex,
          expression: astToInfix(stepAST),
          status: 'UNVERIFIED',
          reductions: 0,
          result: stepEval.result,
          message: `Step ${stepIndex} preserves overall numerical value, but could not be verified as a legitimate direct subexpression reduction: ${match.reason}`,
        });
        sequenceStatus = 'UNVERIFIED';
        firstFailureIndex = stepIndex;
        break;
      } else {
        // Numerical value changed: arithmetic / mathematical error
        verifiedSteps.push({
          stepIndex,
          expression: astToInfix(stepAST),
          status: 'INVALID',
          reductions: 0,
          result: stepEval.result,
          message: `Step ${stepIndex} is mathematically invalid: evaluates to ${stepEval.formattedResult}, expected ${formatDisplayNumber(currentVal, maxDecimals)}. ${match.reason}`,
        });
        sequenceStatus = 'INVALID';
        firstFailureIndex = stepIndex;
        break;
      }
    }
  }

  // 3. Check sequence completeness if all processed steps were VALID
  if (sequenceStatus === 'VALID') {
    // If all steps were VALID, check if the final step reached a single Literal matching the reference
    const finalAST = currentAST;
    if (finalAST.type !== 'Literal') {
      sequenceStatus = 'INCOMPLETE';
    } else if (!isNumericallyEquivalent(finalAST.value, referenceEval.result, tolerance)) {
      sequenceStatus = 'INVALID';
      firstFailureIndex = verifiedSteps.length;
    }
  }

  const isValidSequence = sequenceStatus === 'VALID';
  let summaryMessage;
  switch (sequenceStatus) {
    case 'VALID':
      summaryMessage = 'All submitted steps and final solution are fully verified.';
      break;
    case 'INCOMPLETE':
      summaryMessage = 'All submitted steps are valid, but the expression was not fully evaluated to a final number.';
      break;
    case 'UNVERIFIED':
      summaryMessage = `Step sequence contains an unverified transformation at step ${firstFailureIndex}.`;
      break;
    case 'INVALID':
      summaryMessage = `Step sequence contains an invalid transformation or arithmetic error at step ${firstFailureIndex}.`;
      break;
    case 'SYNTAX_ERROR':
      summaryMessage = `Step sequence contains a syntax error at step ${firstFailureIndex}.`;
      break;
    case 'EVALUATION_ERROR':
      summaryMessage = `Step sequence encountered an evaluation error at step ${firstFailureIndex}.`;
      break;
    default:
      summaryMessage = `Step sequence validation status: ${sequenceStatus}.`;
  }

  return {
    status: sequenceStatus,
    isValidSequence,
    totalStudentSteps: studentSteps.length,
    firstFailureStepIndex: firstFailureIndex,
    steps: verifiedSteps,
    referenceEvaluation: {
      result: referenceEval.result,
      formattedResult: referenceEval.formattedResult,
      stepCount: referenceEval.stepCount,
    },
    message: summaryMessage,
  };
}

/**
 * Match associative regrouping in flat homogeneous chains of '+' or '*'.
 *
 * Examples:
 *   2 + 3 + 4 -> 2 + 7 (reducing 3 + 4 = 7)
 *   2 * 3 * 4 -> 2 * 12 (reducing 3 * 4 = 12)
 *
 * Excludes subtraction (-) and division (/), which are not associative.
 *
 * @param {object} prevNode - AST of S_{k-1}
 * @param {object} nextNode - AST of S_k
 * @param {number} [tolerance=1e-6] - Numerical tolerance
 * @returns {{ matches: boolean, reductions: number, reducedSubexpression?: string, subResult?: number }}
 */
export function matchAssociativeReduction(prevNode, nextNode, tolerance = 1e-6) {
  if (
    !prevNode ||
    !nextNode ||
    prevNode.type !== 'BinaryExpression' ||
    nextNode.type !== 'BinaryExpression'
  ) {
    return { matches: false, reductions: 0 };
  }

  if (prevNode.operator !== nextNode.operator) {
    return { matches: false, reductions: 0 };
  }

  const op = prevNode.operator;
  // Strictly restricted to associative and commutative operators: '+' and '*'
  if (op !== '+' && op !== '*') {
    return { matches: false, reductions: 0 };
  }

  function collectTerms(node) {
    if (node && node.type === 'BinaryExpression' && node.operator === op) {
      return [...collectTerms(node.left), ...collectTerms(node.right)];
    }
    return [node];
  }

  const prevTerms = collectTerms(prevNode);
  const nextTerms = collectTerms(nextNode);

  // An associative reduction of one adjacent pair must decrease the term count by exactly 1
  if (nextTerms.length !== prevTerms.length - 1 || prevTerms.length < 3) {
    return { matches: false, reductions: 0 };
  }

  for (let i = 0; i < prevTerms.length - 1; i++) {
    const leftTerm = prevTerms[i];
    const rightTerm = prevTerms[i + 1];

    if (leftTerm.type !== 'Literal' || rightTerm.type !== 'Literal') {
      continue;
    }

    const leftVal = leftTerm.value;
    const rightVal = rightTerm.value;
    const expectedReduced = op === '+' ? leftVal + rightVal : leftVal * rightVal;

    // Construct candidate terms array where adjacent pair (i, i+1) is replaced by expectedReduced
    const candidateMerged = [
      ...prevTerms.slice(0, i),
      { type: 'Literal', value: expectedReduced },
      ...prevTerms.slice(i + 2),
    ];

    const allMatch = candidateMerged.every((term, idx) => {
      const target = nextTerms[idx];
      return (
        term.type === 'Literal' &&
        target &&
        target.type === 'Literal' &&
        isNumericallyEquivalent(term.value, target.value, tolerance)
      );
    });

    if (allMatch) {
      const opDisplay = op === '*' ? '×' : '+';
      return {
        matches: true,
        reductions: 1,
        reducedSubexpression: `${leftVal} ${opDisplay} ${rightVal}`,
        subResult: expectedReduced,
      };
    }
  }

  return { matches: false, reductions: 0 };
}

/**
 * Verify a single incremental step transition E_{k-1} -> E_k in Step-by-Step Learning Mode.
 *
 * Validates whether the student's next submitted expression is a legitimate,
 * mathematically sound, non-skipping step.
 *
 * Supports:
 * - Single subexpression reductions
 * - Alternative reduction orders in independent branches
 * - Multi-reductions in independent branches within a single step
 * - Associative grouping in flat '+' and '*' chains (when allowAssociativeGrouping is true)
 *
 * Enforces:
 * - Educational step-skipping restriction: forbidding direct jumps to final answer
 *   when multiple operations remain (unless allowStepSkipping is true).
 * - Exact value and structure validation.
 * - Semantic statuses: VALID, COMPLETED, INVALID, UNVERIFIED, NO_PROGRESS,
 *   STEP_SKIPPED, SYNTAX_ERROR, EVALUATION_ERROR.
 *
 * @param {object | string | Array} prevExpr - Current working expression E_{k-1}
 * @param {object | string | Array} nextExpr - Student's submitted step E_k
 * @param {object} [options] - Verification options
 * @param {number} [options.tolerance=1e-6] - Numerical tolerance
 * @param {number} [options.maxDecimals=6] - Max decimals for formatting
 * @param {boolean} [options.allowAssociativeGrouping=true] - Whether to allow associative regrouping for flat + and *
 * @param {boolean} [options.allowStepSkipping=false] - Whether to permit jumping directly to final answer
 * @returns {object} SingleStepVerificationResult
 */
export function verifySingleStep(prevExpr, nextExpr, options = {}) {
  const tolerance = options.tolerance ?? 1e-6;
  const maxDecimals = options.maxDecimals ?? 6;
  const allowAssociativeGrouping = options.allowAssociativeGrouping ?? true;
  const allowStepSkipping = options.allowStepSkipping ?? false;

  // 1. Resolve and evaluate previous expression E_{k-1}
  let prevAST;
  let prevEval;
  try {
    prevAST = resolveAST(prevExpr);
    prevEval = evaluateAST(prevAST, { maxDecimals });
  } catch (err) {
    return {
      isValid: false,
      isComplete: false,
      status: 'EVALUATION_ERROR',
      currentExpression: String(prevExpr),
      nextExpression: String(nextExpr),
      reductions: 0,
      result: null,
      formattedResult: null,
      feedback: {
        title: 'Evaluation Error',
        message: `Failed to evaluate previous expression: ${err.message}`,
        category: 'EVALUATION_ERROR',
        reason: err.message,
      },
      error: { code: err.code || 'EVALUATION_ERROR', message: err.message },
    };
  }

  // 2. Resolve and evaluate next expression E_k
  let nextAST;
  try {
    nextAST = resolveAST(nextExpr);
  } catch (parseErr) {
    return {
      isValid: false,
      isComplete: false,
      status: 'SYNTAX_ERROR',
      currentExpression: astToInfix(prevAST),
      nextExpression: typeof nextExpr === 'string' ? nextExpr : String(nextExpr),
      reductions: 0,
      result: null,
      formattedResult: null,
      feedback: {
        title: 'Syntax Error',
        message: `Syntax error in step: ${parseErr.message}`,
        category: 'SYNTAX_ERROR',
        reason: parseErr.message,
      },
      error: { code: parseErr.code || 'SYNTAX_ERROR', message: parseErr.message },
    };
  }

  let nextEval;
  try {
    nextEval = evaluateAST(nextAST, { maxDecimals });
  } catch (evalErr) {
    return {
      isValid: false,
      isComplete: false,
      status: 'EVALUATION_ERROR',
      currentExpression: astToInfix(prevAST),
      nextExpression: astToInfix(nextAST),
      reductions: 0,
      result: null,
      formattedResult: null,
      feedback: {
        title: 'Evaluation Error',
        message: `Step caused an evaluation error: ${evalErr.message}`,
        category: 'EVALUATION_ERROR',
        reason: evalErr.message,
      },
      error: { code: evalErr.code || 'EVALUATION_ERROR', message: evalErr.message },
    };
  }

  const prevFormatted = astToInfix(prevAST);
  const nextFormatted = astToInfix(nextAST);

  // 3. Repeated Expression Check (Zero progress)
  if (prevFormatted === nextFormatted) {
    return {
      isValid: false,
      isComplete: false,
      status: 'NO_PROGRESS',
      currentExpression: prevFormatted,
      nextExpression: nextFormatted,
      reductions: 0,
      result: nextEval.result,
      formattedResult: nextEval.formattedResult,
      feedback: {
        title: 'No Progress',
        message: 'Identical expression repeated without performing an arithmetic operation.',
        category: 'NO_PROGRESS',
      },
    };
  }

  // 4. Educational Step Skipping Guard
  // If multiple operations remain in prevAST (stepCount > 1), jumping directly to a single Literal is forbidden in Step-by-Step Mode
  if (!allowStepSkipping && prevEval.stepCount > 1 && nextAST.type === 'Literal') {
    return {
      isValid: false,
      isComplete: false,
      status: 'STEP_SKIPPED',
      currentExpression: prevFormatted,
      nextExpression: nextFormatted,
      reductions: 0,
      result: nextEval.result,
      formattedResult: nextEval.formattedResult,
      feedback: {
        title: 'Step Skipped',
        message: 'Directly submitting the final answer is not permitted in Step-by-Step Mode. Please perform one operation at a time.',
        category: 'STEP_SKIPPED',
        reason: `Previous expression requires ${prevEval.stepCount} reduction steps, but student submitted final literal directly.`,
      },
    };
  }

  // 5. Structural Subtree Reduction Verification
  const match = matchSubtreeReduction(prevAST, nextAST, tolerance);

  if (match.matches && match.reductions > 0) {
    const isComplete = nextAST.type === 'Literal';
    return {
      isValid: true,
      isComplete,
      status: isComplete ? 'COMPLETED' : 'VALID',
      currentExpression: prevFormatted,
      nextExpression: nextFormatted,
      reductions: match.reductions,
      result: nextEval.result,
      formattedResult: nextEval.formattedResult,
      feedback: {
        title: isComplete ? 'Problem Solved!' : 'Valid Step',
        message: isComplete
          ? `Final result ${nextEval.formattedResult} reached and verified!`
          : `Valid step: ${match.reductions} subexpression(s) reduced.`,
      },
    };
  }

  // 6. Associative Grouping Fallback (for flat + and * chains)
  if (allowAssociativeGrouping) {
    const assocMatch = matchAssociativeReduction(prevAST, nextAST, tolerance);
    if (assocMatch.matches && assocMatch.reductions > 0) {
      const isComplete = nextAST.type === 'Literal';
      return {
        isValid: true,
        isComplete,
        status: isComplete ? 'COMPLETED' : 'VALID',
        currentExpression: prevFormatted,
        nextExpression: nextFormatted,
        reductions: assocMatch.reductions,
        result: nextEval.result,
        formattedResult: nextEval.formattedResult,
        feedback: {
          title: isComplete ? 'Problem Solved!' : 'Valid Step',
          message: `Valid associative reduction: ${assocMatch.reducedSubexpression} = ${assocMatch.subResult}.`,
        },
      };
    }
  }

  // 7. Value Invariance Inspection (Distinguish UNVERIFIED from INVALID)
  const valuePreserved = isNumericallyEquivalent(nextEval.result, prevEval.result, tolerance);

  if (valuePreserved) {
    return {
      isValid: false,
      isComplete: false,
      status: 'UNVERIFIED',
      currentExpression: prevFormatted,
      nextExpression: nextFormatted,
      reductions: 0,
      result: nextEval.result,
      formattedResult: nextEval.formattedResult,
      feedback: {
        title: 'Unverified Step',
        message: 'This step preserves the overall mathematical value, but could not be verified as a single direct subexpression reduction.',
        category: 'UNVERIFIED_TRANSFORMATION',
        reason: match.reason || 'Structural reduction mismatch.',
      },
    };
  }

  // 8. Mathematically Invalid Step (Value changed or precedence violation)
  let category = 'ARITHMETIC_ERROR';
  let diagMessage = `Mathematically invalid step: evaluates to ${nextEval.formattedResult}, expected ${formatDisplayNumber(prevEval.result, maxDecimals)}.`;

  // Check if precedence violation occurred (e.g. operator changed from + to *)
  if (
    prevAST.type === 'BinaryExpression' &&
    nextAST.type === 'BinaryExpression' &&
    prevAST.operator !== nextAST.operator
  ) {
    category = 'PRECEDENCE_ERROR';
    diagMessage =
      'Operator precedence violation: multiplication and division must be performed before addition and subtraction.';
  }

  return {
    isValid: false,
    isComplete: false,
    status: 'INVALID',
    currentExpression: prevFormatted,
    nextExpression: nextFormatted,
    reductions: 0,
    result: nextEval.result,
    formattedResult: nextEval.formattedResult,
    feedback: {
      title: 'Incorrect Step',
      message: diagMessage,
      category,
      reason: match.reason || 'Mathematical value changed.',
    },
  };
}

/**
 * Generate a non-spoiling, deterministic pedagogical hint for the current expression.
 *
 * Identifies the next subexpression to reduce according to standard PEMDAS / BODMAS
 * precedence rules, guiding the student on what to compute next WITHOUT revealing
 * the calculated answer.
 *
 * @param {object | string | Array} currentExpr - Expression input
 * @param {object} [options] - Hint options
 * @returns {object} StepHint
 */
export function generateStepHint(currentExpr, _options = {}) {
  let ast;
  try {
    ast = resolveAST(currentExpr);
  } catch (err) {
    return {
      targetSubexpression: null,
      operator: null,
      rule: 'SYNTAX_ERROR',
      message: `Cannot generate hint: ${err.message}`,
      isSpoiled: false,
    };
  }

  if (ast.type === 'Literal') {
    return {
      targetSubexpression: null,
      operator: null,
      rule: 'ALREADY_SIMPLIFIED',
      message: 'Expression is already an irreducible single number.',
      isSpoiled: false,
    };
  }

  // Find candidate reducible subtrees (BinaryExpression whose children are Literals)
  function findDirectReductions(node, depth = 0) {
    if (!node || node.type !== 'BinaryExpression') return [];
    const candidates = [];
    if (node.left.type === 'Literal' && node.right.type === 'Literal') {
      candidates.push({ node, depth });
    }
    candidates.push(...findDirectReductions(node.left, depth + 1));
    candidates.push(...findDirectReductions(node.right, depth + 1));
    return candidates;
  }

  const candidates = findDirectReductions(ast);
  if (candidates.length === 0) {
    return {
      targetSubexpression: null,
      operator: null,
      rule: 'GENERAL_ORDER',
      message: 'Look for operations inside parentheses to simplify first.',
      isSpoiled: false,
    };
  }

  // Prioritize candidates:
  // 1. High precedence operators (*, /)
  // 2. Depth in tree
  const highPrec = candidates.filter(
    (c) => c.node.operator === '*' || c.node.operator === '/'
  );
  const pool = highPrec.length > 0 ? highPrec : candidates;

  function formatSubexpr(n) {
    const opDisplay = n.operator === '*' ? '×' : n.operator === '/' ? '÷' : n.operator;
    return `${n.left.value} ${opDisplay} ${n.right.value}`;
  }

  if (pool.length > 1) {
    const formattedList = pool.map((c) => `(${formatSubexpr(c.node)})`).join(' or ');
    return {
      targetSubexpression: formattedList,
      operator: pool[0].node.operator,
      rule: highPrec.length > 0 ? 'PRECEDENCE_HIGH' : 'MULTIPLE_CANDIDATES',
      message: `You can simplify either ${formattedList} first.`,
      isSpoiled: false,
    };
  }

  const chosen = pool[0];
  const formatted = formatSubexpr(chosen.node);
  const isHigh = chosen.node.operator === '*' || chosen.node.operator === '/';

  let rule = isHigh ? 'PRECEDENCE_HIGH' : 'LEFT_TO_RIGHT';
  let message;

  if (isHigh) {
    const opName = chosen.node.operator === '*' ? 'Multiplication' : 'Division';
    message = `${opName} takes precedence over addition and subtraction. Try calculating ${formatted} first.`;
  } else {
    message = `Try calculating ${formatted} next.`;
  }

  return {
    targetSubexpression: formatted,
    operator: chosen.node.operator,
    rule,
    message,
    isSpoiled: false,
  };
}
