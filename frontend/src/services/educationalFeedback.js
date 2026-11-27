/**
 * AeroSolve — Milestone 7.2: Educational Feedback Engine
 *
 * Implements an isolated, deterministic educational layer that consumes
 * mathematical verification results and relevant expressions/attempt context.
 *
 * Scope & Guarantees:
 * 1. Authority Preservation: Uses verifySingleStep as the mathematical authority;
 *    never overrides or contradicts mathematical validity or verification outcomes.
 * 2. Deterministic Classification: Classifies step errors into distinct educational
 *    categories with definitive, probable, or ambiguous confidence.
 * 3. Structured Pedagogical Output: Produces student-friendly titles, explanations,
 *    actionable remediation advice, and suggested progressive hint levels.
 * 4. 3-Tier Progressive Guidance:
 *    - Level 1: Gentle conceptual nudge (general rule, zero numbers, zero answer spoilers).
 *    - Level 2: Focused guidance (identifies target operation/subexpression without solving it).
 *    - Level 3: Rule explanation with a validated numerical parallel example (disjoint numbers)
 *               or a safe non-numerical fallback explanation.
 * 5. Strict Anti-Spoiler Policy: Never reveals the target subexpression result or the final answer.
 *    Parallel examples are validated to ensure zero numerical overlap with current problem literals,
 *    target subexpression result, and final result.
 * 6. Pure & Independent: Zero React dependencies, zero persistent storage, zero AI/LLM APIs,
 *    and zero randomness.
 */

import { parseExpression } from './expressionParser.js';
import {
  evaluateAST,
  astToInfix,
  cloneAST,
} from './expressionEvaluator.js';
import {
  verifySingleStep,
  isNumericallyEquivalent,
} from './solutionVerifier.js';

/**
 * Educational error classification categories.
 */
export const EducationalCategory = Object.freeze({
  PRECEDENCE_VIOLATION: 'PRECEDENCE_VIOLATION',
  ARITHMETIC_SLIP: 'ARITHMETIC_SLIP',
  SIGN_ERROR: 'SIGN_ERROR',
  UNSUPPORTED_GROUPING: 'UNSUPPORTED_GROUPING',
  COMPOUND_STEP: 'COMPOUND_STEP',
  STEP_SKIPPED: 'STEP_SKIPPED',
  NO_PROGRESS: 'NO_PROGRESS',
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  EVALUATION_ERROR: 'EVALUATION_ERROR',
  UNCLASSIFIED_INVALID: 'UNCLASSIFIED_INVALID',
  NONE: 'NONE',
});

/**
 * Diagnostic confidence levels.
 */
export const ConfidenceLevel = Object.freeze({
  DEFINITIVE: 'DEFINITIVE',
  PROBABLE: 'PROBABLE',
  AMBIGUOUS: 'AMBIGUOUS',
});

/**
 * Translate technical error categories into supportive, student-friendly labels.
 *
 * @param {string} category - Technical error category
 * @returns {string} Student-friendly label
 */
export function translateCategoryLabel(category) {
  if (!category || category === 'NONE') return '';
  switch (category) {
    case 'PRECEDENCE_VIOLATION':
    case 'PRECEDENCE_ERROR':
      return 'Order of Operations';
    case 'ARITHMETIC_SLIP':
    case 'ARITHMETIC_ERROR':
      return 'Calculation Slip';
    case 'SIGN_ERROR':
      return 'Sign Check';
    case 'UNSUPPORTED_GROUPING':
      return 'Regrouping Rule';
    case 'COMPOUND_STEP':
      return 'Multiple Steps';
    case 'STEP_SKIPPED':
      return 'Show Your Work';
    case 'NO_PROGRESS':
      return 'No Change';
    case 'SYNTAX_ERROR':
      return 'Syntax Check';
    case 'EVALUATION_ERROR':
      return 'Math Error';
    case 'UNCLASSIFIED_INVALID':
    case 'UNVERIFIED_TRANSFORMATION':
      return 'Check Your Step';
    default:
      return String(category).replace(/_/g, ' ');
  }
}

/**
 * Resolve an input into a cloned AST node.
 * Accepts AST objects, expression strings, or token arrays.
 *
 * @param {object | string | Array} input - AST, expression string, or token array
 * @returns {object} AST root node
 */
function resolveAST(input) {
  if (input === null || input === undefined) {
    throw new Error('Expression input cannot be null or undefined');
  }
  if (typeof input === 'object' && !Array.isArray(input) && typeof input.type === 'string') {
    return cloneAST(input);
  }
  return parseExpression(input);
}

/**
 * Extract all numerical literals appearing in an AST.
 *
 * @param {object} ast - AST node
 * @returns {number[]} Array of literal values
 */
export function extractASTLiterals(ast) {
  if (!ast) return [];
  const literals = [];
  function traverse(node) {
    if (!node) return;
    if (node.type === 'Literal') {
      literals.push(node.value);
    } else if (node.type === 'BinaryExpression') {
      traverse(node.left);
      traverse(node.right);
    }
  }
  traverse(ast);
  return literals;
}

/**
 * Check whether two ASTs are structurally identical and numerically equivalent.
 *
 * @param {object} nodeA
 * @param {object} nodeB
 * @param {number} tolerance
 * @returns {boolean}
 */
export function areASTsStructurallyIdentical(nodeA, nodeB, tolerance = 1e-6) {
  if (!nodeA || !nodeB) return false;
  if (nodeA.type !== nodeB.type) return false;

  if (nodeA.type === 'Literal') {
    return isNumericallyEquivalent(nodeA.value, nodeB.value, tolerance);
  }

  if (nodeA.type === 'BinaryExpression') {
    if (nodeA.operator !== nodeB.operator) return false;
    return (
      areASTsStructurallyIdentical(nodeA.left, nodeB.left, tolerance) &&
      areASTsStructurallyIdentical(nodeA.right, nodeB.right, tolerance)
    );
  }

  return false;
}

/**
 * Find all directly reducible subexpressions (BinaryExpressions with two Literal children).
 *
 * @param {object} node - AST node
 * @returns {object[]} Array of reducible nodes
 */
function findReducibleSubtrees(node) {
  if (!node || node.type !== 'BinaryExpression') return [];
  const results = [];
  if (node.left?.type === 'Literal' && node.right?.type === 'Literal') {
    results.push(node);
  }
  results.push(...findReducibleSubtrees(node.left));
  results.push(...findReducibleSubtrees(node.right));
  return results;
}

/**
 * Format a binary operation node into a display string.
 *
 * @param {object} node - BinaryExpression node
 * @returns {string} Formatted string, e.g. "3 × 4"
 */
function formatSubexpressionNode(node) {
  if (!node || node.type !== 'BinaryExpression') return '';
  const opDisplay =
    node.operator === '*' ? '×' : node.operator === '/' ? '÷' : node.operator;
  const leftVal = node.left?.value ?? '?';
  const rightVal = node.right?.value ?? '?';
  return `${leftVal} ${opDisplay} ${rightVal}`;
}

/**
 * Validate that candidate parallel example numbers have ZERO overlap
 * with forbidden problem numbers.
 *
 * @param {number[]} candidateNumbers - All numbers in parallel example
 * @param {Set<number> | number[]} forbiddenNumbers - Numbers from current problem
 * @returns {boolean} True if completely disjoint and safe
 */
export function validateParallelExample(candidateNumbers, forbiddenNumbers) {
  if (!Array.isArray(candidateNumbers) || candidateNumbers.length === 0) {
    return false;
  }
  const forbiddenSet =
    forbiddenNumbers instanceof Set
      ? forbiddenNumbers
      : new Set(forbiddenNumbers || []);

  for (const num of candidateNumbers) {
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      return false;
    }
    if (forbiddenSet.has(num)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a candidate step represents an unsupported grouping across subtraction or division.
 * For example:
 * 10 - 4 - 2 -> 10 - 2 (student evaluated 4 - 2 = 2)
 * 16 / 4 / 2 -> 16 / 2 (student evaluated 4 / 2 = 2)
 *
 * @param {object} prevAST
 * @param {object} nextAST
 * @returns {boolean}
 */
function detectUnsupportedGrouping(prevAST, nextAST) {
  if (!prevAST || !nextAST) return false;

  // Pattern: (A - B) - C where candidate is A - (B - C)
  // Or: (A / B) / C where candidate is A / (B / C)
  if (
    prevAST.type === 'BinaryExpression' &&
    (prevAST.operator === '-' || prevAST.operator === '/') &&
    prevAST.left?.type === 'BinaryExpression' &&
    prevAST.left.operator === prevAST.operator &&
    prevAST.left.left?.type === 'Literal' &&
    prevAST.left.right?.type === 'Literal' &&
    prevAST.right?.type === 'Literal' &&
    nextAST.type === 'BinaryExpression' &&
    nextAST.operator === prevAST.operator &&
    nextAST.left?.type === 'Literal' &&
    nextAST.right?.type === 'Literal'
  ) {
    const a = prevAST.left.left.value;
    const b = prevAST.left.right.value;
    const c = prevAST.right.value;

    let subResult;
    if (prevAST.operator === '-') {
      subResult = b - c;
    } else if (prevAST.operator === '/') {
      if (c === 0) return false;
      subResult = b / c;
    }

    if (
      isNumericallyEquivalent(nextAST.left.value, a) &&
      isNumericallyEquivalent(nextAST.right.value, subResult)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Detect whether an invalid transformation is a precedence violation.
 *
 * @param {object} prevAST
 * @param {object} nextAST
 * @returns {boolean}
 */
function detectPrecedenceViolation(prevAST, nextAST) {
  if (!prevAST || !nextAST) return false;

  // Case 1: BinaryExpression top operator changed from + or - to * or /
  // e.g. 8 + 3 * 2 (top operator +) -> student calculates 8 + 3 = 11 -> 11 * 2 (top operator *)
  if (
    prevAST.type === 'BinaryExpression' &&
    nextAST.type === 'BinaryExpression' &&
    (prevAST.operator === '+' || prevAST.operator === '-') &&
    (nextAST.operator === '*' || nextAST.operator === '/')
  ) {
    return true;
  }

  // Case 2: In a tree with both (+ or -) and (* or /), student reduced the addition/subtraction
  // while the high-priority multiplication/division remained
  if (prevAST.type === 'BinaryExpression' && nextAST.type === 'BinaryExpression') {
    const prevText = astToInfix(prevAST);
    const hasHighOp = prevText.includes('*') || prevText.includes('/');
    const hasLowOp = prevText.includes('+') || prevText.includes('-');

    if (hasHighOp && hasLowOp) {
      // Check if student calculated left-to-right strictly
      // e.g. in 2 + 3 * 4 -> candidate is 5 * 4
      if (
        prevAST.left?.type === 'Literal' &&
        prevAST.right?.type === 'BinaryExpression' &&
        (prevAST.operator === '+' || prevAST.operator === '-') &&
        (prevAST.right.operator === '*' || prevAST.right.operator === '/') &&
        prevAST.right.left?.type === 'Literal'
      ) {
        const naiveLeftSum =
          prevAST.operator === '+'
            ? prevAST.left.value + prevAST.right.left.value
            : prevAST.left.value - prevAST.right.left.value;
        if (
          isNumericallyEquivalent(nextAST.left?.value, naiveLeftSum) &&
          nextAST.operator === prevAST.right.operator
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Detect whether an invalid transformation is an arithmetic slip or sign error.
 *
 * An arithmetic slip occurs when the student identified the correct subexpression node
 * and preserved the surrounding tree structure, but calculated an incorrect value.
 * If the value has the correct magnitude but opposite sign, it is classified as a SIGN_ERROR.
 *
 * @param {object} prevAST
 * @param {object} nextAST
 * @param {number} tolerance
 * @returns {{ category: string, reducibleNode: object, expected: number, candidate: number } | null}
 */
function detectArithmeticOrSignSlip(prevAST, nextAST, tolerance = 1e-6) {
  if (!prevAST || !nextAST) return null;

  const reducibleNodes = findReducibleSubtrees(prevAST);
  if (reducibleNodes.length === 0) return null;

  for (const redex of reducibleNodes) {
    const leftVal = redex.left.value;
    const rightVal = redex.right.value;
    let expectedVal;
    switch (redex.operator) {
      case '+':
        expectedVal = leftVal + rightVal;
        break;
      case '-':
        expectedVal = leftVal - rightVal;
        break;
      case '*':
        expectedVal = leftVal * rightVal;
        break;
      case '/':
        if (rightVal === 0) continue;
        expectedVal = leftVal / rightVal;
        break;
      default:
        continue;
    }

    // Try candidate values by matching nextAST structure
    function findCandidateLiteralInPosition(origTree, nextTree, target) {
      if (origTree === target) {
        if (nextTree && nextTree.type === 'Literal') {
          return nextTree.value;
        }
        return null;
      }
      if (
        !origTree ||
        !nextTree ||
        origTree.type !== 'BinaryExpression' ||
        nextTree.type !== 'BinaryExpression' ||
        origTree.operator !== nextTree.operator
      ) {
        return null;
      }
      const leftMatch = findCandidateLiteralInPosition(origTree.left, nextTree.left, target);
      if (leftMatch !== null) {
        // Also verify right subtree is identical
        if (areASTsStructurallyIdentical(origTree.right, nextTree.right, tolerance)) {
          return leftMatch;
        }
      }
      const rightMatch = findCandidateLiteralInPosition(origTree.right, nextTree.right, target);
      if (rightMatch !== null) {
        // Also verify left subtree is identical
        if (areASTsStructurallyIdentical(origTree.left, nextTree.left, tolerance)) {
          return rightMatch;
        }
      }
      return null;
    }

    const candidateVal = findCandidateLiteralInPosition(prevAST, nextAST, redex);
    if (candidateVal !== null && typeof candidateVal === 'number') {
      // Check for Sign Error: correct magnitude, inverted sign (non-zero)
      if (
        expectedVal !== 0 &&
        isNumericallyEquivalent(candidateVal, -expectedVal, tolerance)
      ) {
        return {
          category: EducationalCategory.SIGN_ERROR,
          reducibleNode: redex,
          expected: expectedVal,
          candidate: candidateVal,
        };
      }

      // Check for Arithmetic Slip: value differs from expectedVal
      if (!isNumericallyEquivalent(candidateVal, expectedVal, tolerance)) {
        return {
          category: EducationalCategory.ARITHMETIC_SLIP,
          reducibleNode: redex,
          expected: expectedVal,
          candidate: candidateVal,
        };
      }
    }
  }

  return null;
}

/**
 * Classify a student's step submission into an educational category.
 *
 * Consumes the mathematical verification outcome and produces contextual pedagogical feedback
 * without overriding or contradicting the verifier's authority.
 *
 * @param {object | string | Array} prevExpr - Current working expression
 * @param {object | string | Array} nextExpr - Student's proposed step
 * @param {object} [verificationResult] - Result from verifySingleStep(prevExpr, nextExpr)
 * @param {object} [options] - Optional classification settings
 * @param {number} [options.tolerance=1e-6] - Numerical tolerance
 * @param {number} [options.maxDecimals=6] - Max decimal places for formatting
 * @returns {object} EducationalFeedbackResult
 */
export function classifyStepError(
  prevExpr,
  nextExpr,
  verificationResult = null,
  options = {}
) {
  const tolerance = options.tolerance ?? 1e-6;
  const maxDecimals = options.maxDecimals ?? 6;

  // Use provided verification result or execute verifySingleStep as mathematical authority
  const vResult =
    verificationResult || verifySingleStep(prevExpr, nextExpr, { tolerance, maxDecimals });

  // 1. Valid Steps (VALID or COMPLETED)
  if (vResult.isValid) {
    const isComplete = vResult.isComplete;
    return {
      isValid: true,
      isComplete,
      status: vResult.status,
      category: EducationalCategory.NONE,
      confidence: ConfidenceLevel.DEFINITIVE,
      title: isComplete ? 'Problem Solved!' : 'Valid Step',
      explanation: isComplete
        ? `Final result ${vResult.formattedResult} verified successfully!`
        : 'Your step is mathematically correct. Keep going!',
      remediationAdvice: isComplete
        ? 'Great job! You have fully simplified the expression.'
        : 'Continue by identifying the next operation to simplify.',
      suggestedHintLevel: 1,
      diagnostic: {
        reductions: vResult.reductions,
        result: vResult.result,
        formattedResult: vResult.formattedResult,
      },
    };
  }

  // 2. Syntax Errors
  if (vResult.status === 'SYNTAX_ERROR') {
    return {
      isValid: false,
      isComplete: false,
      status: 'SYNTAX_ERROR',
      category: EducationalCategory.SYNTAX_ERROR,
      confidence: ConfidenceLevel.DEFINITIVE,
      title: 'Syntax Error',
      explanation:
        'The submitted step contains a syntax error or incomplete formatting.',
      remediationAdvice:
        'Check for balanced parentheses, proper operator placement, and complete numbers.',
      suggestedHintLevel: 1,
      diagnostic: { error: vResult.error },
    };
  }

  // 3. Evaluation Errors (e.g. division by zero)
  if (vResult.status === 'EVALUATION_ERROR') {
    return {
      isValid: false,
      isComplete: false,
      status: 'EVALUATION_ERROR',
      category: EducationalCategory.EVALUATION_ERROR,
      confidence: ConfidenceLevel.DEFINITIVE,
      title: 'Calculation Error',
      explanation:
        'This step causes an undefined mathematical operation, such as division by zero.',
      remediationAdvice:
        'Review the operation to ensure divisors are not zero.',
      suggestedHintLevel: 1,
      diagnostic: { error: vResult.error },
    };
  }

  // 4. Repeated Expression (NO_PROGRESS)
  if (vResult.status === 'NO_PROGRESS') {
    return {
      isValid: false,
      isComplete: false,
      status: 'NO_PROGRESS',
      category: EducationalCategory.NO_PROGRESS,
      confidence: ConfidenceLevel.DEFINITIVE,
      title: 'No Progress',
      explanation:
        'This expression is identical to the previous line without performing an operation.',
      remediationAdvice:
        'Select one operation to calculate and write the updated expression.',
      suggestedHintLevel: 1,
      diagnostic: {},
    };
  }

  // 5. Step Skipped (direct jump to final answer with multiple steps remaining)
  if (vResult.status === 'STEP_SKIPPED') {
    return {
      isValid: false,
      isComplete: false,
      status: 'STEP_SKIPPED',
      category: EducationalCategory.STEP_SKIPPED,
      confidence: ConfidenceLevel.DEFINITIVE,
      title: 'Intermediate Step Required',
      explanation:
        'You submitted the final answer directly, but multiple intermediate operations remain.',
      remediationAdvice:
        'In Step-by-Step Learning Mode, show your work by solving one operation at a time.',
      suggestedHintLevel: 2,
      diagnostic: { reason: vResult.feedback?.reason },
    };
  }

  // Resolve ASTs for structural inspection of UNVERIFIED and INVALID cases
  let prevAST;
  let nextAST;
  let prevEval;
  try {
    prevAST = resolveAST(prevExpr);
    nextAST = resolveAST(nextExpr);
    prevEval = evaluateAST(prevAST, { maxDecimals });
  } catch {
    return {
      isValid: false,
      isComplete: false,
      status: vResult.status,
      category: EducationalCategory.UNCLASSIFIED_INVALID,
      confidence: ConfidenceLevel.AMBIGUOUS,
      title: 'Incorrect Step',
      explanation: 'This step could not be verified against the previous expression.',
      remediationAdvice: 'Compare your numbers and operators with the previous expression.',
      suggestedHintLevel: 1,
      diagnostic: {},
    };
  }

  // 6. Unverified Steps (Value Preserved, but not a single canonical reduction)
  if (vResult.status === 'UNVERIFIED') {
    let nextEval;
    try {
      nextEval = evaluateAST(nextAST, { maxDecimals });
    } catch {
      nextEval = null;
    }

    // Check if it is a Compound Step: multiple operations eliminated at once,
    // or matched a future step in the canonical reduction chain
    let isCompound = false;
    let stepsSkipped = 2;

    if (nextEval && prevEval && prevEval.stepCount - nextEval.stepCount >= 2) {
      isCompound = true;
      stepsSkipped = prevEval.stepCount - nextEval.stepCount;
    } else if (prevEval && Array.isArray(prevEval.steps) && prevEval.steps.length >= 2) {
      for (let i = 1; i < prevEval.steps.length; i++) {
        const futureStep = prevEval.steps[i];
        if (
          areASTsStructurallyIdentical(nextAST, futureStep.astAfter, tolerance) ||
          astToInfix(nextAST) === futureStep.afterExpression
        ) {
          isCompound = true;
          stepsSkipped = i + 1;
          break;
        }
      }
    }

    if (isCompound) {
      return {
        isValid: false,
        isComplete: false,
        status: 'UNVERIFIED',
        category: EducationalCategory.COMPOUND_STEP,
        confidence: ConfidenceLevel.DEFINITIVE,
        title: 'Multiple Steps Combined',
        explanation: `You completed ${stepsSkipped} operations in a single step!`,
        remediationAdvice:
          'Step-by-step learning requires solving one operation at a time. Roll back and show the first reduction.',
        suggestedHintLevel: 2,
        diagnostic: { stepsSkipped },
      };
    }

    // Value preserved, but not an identifiable compound step
    return {
      isValid: false,
      isComplete: false,
      status: 'UNVERIFIED',
      category: EducationalCategory.UNCLASSIFIED_INVALID,
      confidence: ConfidenceLevel.AMBIGUOUS,
      title: 'Unverified Step',
      explanation:
        'This step preserves the overall mathematical value, but does not match an allowable single reduction step.',
      remediationAdvice:
        'Perform a single direct calculation respecting standard order of operations.',
      suggestedHintLevel: 2,
      diagnostic: { reason: vResult.feedback?.reason },
    };
  }

  // 7. Mathematically Invalid Steps (Value Changed)
  if (vResult.status === 'INVALID') {
    // A. Check for Unsupported Grouping across non-associative operators (- or /)
    if (detectUnsupportedGrouping(prevAST, nextAST)) {
      return {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        category: EducationalCategory.UNSUPPORTED_GROUPING,
        confidence: ConfidenceLevel.PROBABLE,
        title: 'Non-Associative Regrouping',
        explanation:
          'Regrouping is not permitted across subtraction or division because changing the order alters the result.',
        remediationAdvice:
          'Evaluate subtraction and division strictly from left to right.',
        suggestedHintLevel: 2,
        diagnostic: {
          operator: prevAST.operator,
        },
      };
    }

    // B. Check for Precedence Violations
    if (detectPrecedenceViolation(prevAST, nextAST)) {
      return {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        category: EducationalCategory.PRECEDENCE_VIOLATION,
        confidence: ConfidenceLevel.PROBABLE,
        title: 'Order of Operations Error',
        explanation:
          'Multiplication and division must be performed before addition and subtraction according to PEMDAS / BODMAS.',
        remediationAdvice:
          'Identify and calculate operations with higher precedence first.',
        suggestedHintLevel: 2,
        diagnostic: {},
      };
    }

    // C. Check for Sign Error or Arithmetic Slip
    const slipMatch = detectArithmeticOrSignSlip(prevAST, nextAST, tolerance);
    if (slipMatch) {
      if (slipMatch.category === EducationalCategory.SIGN_ERROR) {
        return {
          isValid: false,
          isComplete: false,
          status: 'INVALID',
          category: EducationalCategory.SIGN_ERROR,
          confidence: ConfidenceLevel.PROBABLE,
          title: 'Sign Error',
          explanation:
            'The calculated value has the correct magnitude, but the positive or negative sign is reversed.',
          remediationAdvice:
            'Pay close attention to whether your operation results in a positive or negative number.',
          suggestedHintLevel: 2,
          diagnostic: {
            expected: slipMatch.expected,
            candidate: slipMatch.candidate,
          },
        };
      }

      if (slipMatch.category === EducationalCategory.ARITHMETIC_SLIP) {
        const subDisplay = formatSubexpressionNode(slipMatch.reducibleNode);
        return {
          isValid: false,
          isComplete: false,
          status: 'INVALID',
          category: EducationalCategory.ARITHMETIC_SLIP,
          confidence: ConfidenceLevel.PROBABLE,
          title: 'Calculation Slip',
          explanation: `You selected the right operation (${subDisplay}) to calculate, but made a calculation slip.`,
          remediationAdvice: `Double-check your basic arithmetic calculation for ${subDisplay}.`,
          suggestedHintLevel: 2,
          diagnostic: {
            subexpression: subDisplay,
            expected: slipMatch.expected,
            candidate: slipMatch.candidate,
          },
        };
      }
    }

    // D. Ambiguous / Unclassified Invalid Step
    return {
      isValid: false,
      isComplete: false,
      status: 'INVALID',
      category: EducationalCategory.UNCLASSIFIED_INVALID,
      confidence: ConfidenceLevel.AMBIGUOUS,
      title: 'Incorrect Step',
      explanation:
        'This step does not match any recognized single-step mathematical transformation.',
      remediationAdvice:
        'Compare your expression to the previous line and check both your chosen operation and numbers.',
      suggestedHintLevel: 1,
      diagnostic: {
        expectedResult: prevEval.formattedResult,
      },
    };
  }

  // Fallback for any unexpected status
  return {
    isValid: false,
    isComplete: false,
    status: vResult.status,
    category: EducationalCategory.UNCLASSIFIED_INVALID,
    confidence: ConfidenceLevel.AMBIGUOUS,
    title: 'Unrecognized Step',
    explanation: 'Unable to evaluate this transformation.',
    remediationAdvice: 'Please check your expression and try again.',
    suggestedHintLevel: 1,
    diagnostic: {},
  };
}

/**
 * Candidate parallel examples pool for Level 3 rule explanations.
 * Each entry holds an expression string, the first step, explanation, and all numerical literals involved.
 */
const PARALLEL_EXAMPLES = {
  PARENTHESES: [
    {
      expression: '(4 + 5) × 7',
      firstStep: '4 + 5 = 9',
      explanation: 'Calculate inside parentheses first: 4 + 5 = 9, then 9 × 7 = 63.',
      numbers: [4, 5, 7, 9, 63],
    },
    {
      expression: '(6 + 7) × 3',
      firstStep: '6 + 7 = 13',
      explanation: 'Calculate inside parentheses first: 6 + 7 = 13, then 13 × 3 = 39.',
      numbers: [6, 7, 3, 13, 39],
    },
    {
      expression: '15 - (3 + 4)',
      firstStep: '3 + 4 = 7',
      explanation: 'Calculate inside parentheses first: 3 + 4 = 7, then 15 - 7 = 8.',
      numbers: [15, 3, 4, 7, 8],
    },
    {
      expression: '(8 + 7) × 2',
      firstStep: '8 + 7 = 15',
      explanation: 'Calculate inside parentheses first: 8 + 7 = 15, then 15 × 2 = 30.',
      numbers: [8, 7, 2, 15, 30],
    },
  ],
  PRECEDENCE_MUL_ADD: [
    {
      expression: '5 + 4 × 7',
      firstStep: '4 × 7 = 28',
      explanation: 'Multiply first: 4 × 7 = 28, then add: 5 + 28 = 33.',
      numbers: [5, 4, 7, 28, 33],
    },
    {
      expression: '7 + 5 × 9',
      firstStep: '5 × 9 = 45',
      explanation: 'Multiply first: 5 × 9 = 45, then add: 7 + 45 = 52.',
      numbers: [7, 5, 9, 45, 52],
    },
    {
      expression: '9 + 4 × 6',
      firstStep: '4 × 6 = 24',
      explanation: 'Multiply first: 4 × 6 = 24, then add: 9 + 24 = 33.',
      numbers: [9, 4, 6, 24, 33],
    },
    {
      expression: '6 + 5 × 7',
      firstStep: '5 × 7 = 35',
      explanation: 'Multiply first: 5 × 7 = 35, then add: 6 + 35 = 41.',
      numbers: [6, 5, 7, 35, 41],
    },
  ],
  PRECEDENCE_DIV_SUB: [
    {
      expression: '25 - 18 ÷ 6',
      firstStep: '18 ÷ 6 = 3',
      explanation: 'Divide first: 18 ÷ 6 = 3, then subtract: 25 - 3 = 22.',
      numbers: [25, 18, 6, 3, 22],
    },
    {
      expression: '30 - 15 ÷ 5',
      firstStep: '15 ÷ 5 = 3',
      explanation: 'Divide first: 15 ÷ 5 = 3, then subtract: 30 - 3 = 27.',
      numbers: [30, 15, 5, 3, 27],
    },
    {
      expression: '28 - 24 ÷ 8',
      firstStep: '24 ÷ 8 = 3',
      explanation: 'Divide first: 24 ÷ 8 = 3, then subtract: 28 - 3 = 25.',
      numbers: [28, 24, 8, 3, 25],
    },
  ],
  LEFT_TO_RIGHT: [
    {
      expression: '15 - 7 + 4',
      firstStep: '15 - 7 = 8',
      explanation: 'Work from left to right: 15 - 7 = 8, then 8 + 4 = 12.',
      numbers: [15, 7, 4, 8, 12],
    },
    {
      expression: '18 - 9 + 5',
      firstStep: '18 - 9 = 9',
      explanation: 'Work from left to right: 18 - 9 = 9, then 9 + 5 = 14.',
      numbers: [18, 9, 5, 9, 14],
    },
    {
      expression: '24 ÷ 4 × 3',
      firstStep: '24 ÷ 4 = 6',
      explanation: 'Work from left to right: 24 ÷ 4 = 6, then 6 × 3 = 18.',
      numbers: [24, 4, 3, 6, 18],
    },
    {
      expression: '30 ÷ 5 × 4',
      firstStep: '30 ÷ 5 = 6',
      explanation: 'Work from left to right: 30 ÷ 5 = 6, then 6 × 4 = 24.',
      numbers: [30, 5, 4, 6, 24],
    },
  ],
};

/**
 * Generate a deterministic, 3-tier progressive hint for the current expression.
 *
 * Anti-spoiler guarantee:
 * - Level 1: Conceptual nudge only (mentions rule, zero numbers, zero answer leaks).
 * - Level 2: Pinpoints the specific target subexpression (never evaluates or reveals its result).
 * - Level 3: Explains the rule with a parallel example whose numbers are strictly disjoint from
 *            the student's problem, or falls back to a safe non-numerical rule explanation.
 *
 * @param {object | string | Array} currentExpr - Current working expression
 * @param {number} [requestedLevel=1] - Requested hint tier (1, 2, or 3)
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.forceFallback=false] - Force non-numerical fallback for testing
 * @param {number} [options.maxDecimals=6] - Max decimals for formatting
 * @returns {object} ProgressiveHintResult
 */
export function generateProgressiveHint(
  currentExpr,
  requestedLevel = 1,
  options = {}
) {
  const level = Math.max(1, Math.min(3, Math.floor(requestedLevel || 1)));
  const forceFallback = options.forceFallback ?? false;
  const maxDecimals = options.maxDecimals ?? 6;

  // 1. Resolve and validate current expression AST
  let ast;
  try {
    ast = resolveAST(currentExpr);
  } catch {
    return {
      level,
      ruleKey: 'SYNTAX_ERROR',
      title: 'Syntax Error',
      hintText: 'Check your expression for missing numbers, operators, or unbalanced parentheses.',
      targetSubexpression: null,
      operator: null,
      hasParallelExample: false,
      parallelExample: null,
      antiSpoilerGuarantee: true,
    };
  }

  // If already a single literal
  if (ast.type === 'Literal') {
    return {
      level,
      ruleKey: 'ALREADY_SIMPLIFIED',
      title: 'Fully Simplified',
      hintText: 'This expression is already a single number and cannot be simplified further.',
      targetSubexpression: null,
      operator: null,
      hasParallelExample: false,
      parallelExample: null,
      antiSpoilerGuarantee: true,
    };
  }

  // 2. Evaluate AST to gather canonical problem context and forbidden numbers
  let evalResult;
  try {
    evalResult = evaluateAST(ast, { maxDecimals });
  } catch {
    return {
      level,
      ruleKey: 'EVALUATION_ERROR',
      title: 'Calculation Error',
      hintText: 'This expression causes a calculation error such as division by zero.',
      targetSubexpression: null,
      operator: null,
      hasParallelExample: false,
      parallelExample: null,
      antiSpoilerGuarantee: true,
    };
  }

  // Collect all problem literals to prevent any overlap in parallel examples
  const problemLiterals = extractASTLiterals(ast);
  const finalAnswer = evalResult.result;

  // 3. Find candidate reducible subtrees
  const candidates = findReducibleSubtrees(ast);
  if (candidates.length === 0) {
    return {
      level,
      ruleKey: 'PARENTHESES_FIRST',
      title: 'Order of Operations: Parentheses',
      hintText: 'Look for operations inside parentheses to evaluate first.',
      targetSubexpression: null,
      operator: null,
      hasParallelExample: false,
      parallelExample: null,
      antiSpoilerGuarantee: true,
    };
  }

  // 4. Prioritize target subexpression by PEMDAS / BODMAS
  const highPrecCandidates = candidates.filter(
    (c) => c.operator === '*' || c.operator === '/'
  );
  const pool = highPrecCandidates.length > 0 ? highPrecCandidates : candidates;
  const chosen = pool[0];
  const targetOperator = chosen.operator;
  const targetFormatted = formatSubexpressionNode(chosen);

  // Compute target result strictly to add to forbidden numbers (NEVER to output in hint)
  let targetSubResult;
  switch (chosen.operator) {
    case '+':
      targetSubResult = chosen.left.value + chosen.right.value;
      break;
    case '-':
      targetSubResult = chosen.left.value - chosen.right.value;
      break;
    case '*':
      targetSubResult = chosen.left.value * chosen.right.value;
      break;
    case '/':
      targetSubResult = chosen.right.value !== 0 ? chosen.left.value / chosen.right.value : null;
      break;
    default:
      targetSubResult = null;
  }

  const forbiddenNumbers = new Set(problemLiterals);
  if (typeof finalAnswer === 'number' && Number.isFinite(finalAnswer)) {
    forbiddenNumbers.add(finalAnswer);
  }
  if (typeof targetSubResult === 'number' && Number.isFinite(targetSubResult)) {
    forbiddenNumbers.add(targetSubResult);
  }

  // Determine governing rule and category
  const expressionText = astToInfix(ast);
  const hasParentheses = expressionText.includes('(');
  const hasHighPrec = expressionText.includes('*') || expressionText.includes('/');
  const hasLowPrec = expressionText.includes('+') || expressionText.includes('-');

  let ruleKey;
  let ruleCategory;
  if (hasParentheses) {
    ruleKey = 'PARENTHESES_FIRST';
    ruleCategory = 'PARENTHESES';
  } else if (hasHighPrec && hasLowPrec) {
    ruleKey = 'PRECEDENCE_PRIORITY';
    ruleCategory = targetOperator === '/' ? 'PRECEDENCE_DIV_SUB' : 'PRECEDENCE_MUL_ADD';
  } else {
    ruleKey = 'LEFT_TO_RIGHT';
    ruleCategory = 'LEFT_TO_RIGHT';
  }

  // 5. Build Level 1: Gentle Conceptual Nudge (Zero numbers from problem, zero spoiler)
  if (level === 1) {
    let title;
    let hintText;

    if (ruleKey === 'PARENTHESES_FIRST') {
      title = 'Order of Operations: Parentheses';
      hintText =
        'Operations inside parentheses should always be evaluated first before calculating operations outside.';
    } else if (ruleKey === 'PRECEDENCE_PRIORITY') {
      title = 'Order of Operations: Multiplication & Division First';
      hintText =
        'Multiplication and division have higher priority than addition and subtraction. Look for × or ÷ operations first.';
    } else {
      title = 'Order of Operations: Left to Right';
      hintText =
        'When operations have equal priority, evaluate them in order from left to right.';
    }

    return {
      level: 1,
      ruleKey,
      title,
      hintText,
      targetSubexpression: null,
      operator: targetOperator,
      hasParallelExample: false,
      parallelExample: null,
      antiSpoilerGuarantee: true,
    };
  }

  // 6. Build Level 2: Focused Guidance (Identifies target subexpression, NEVER calculates answer)
  if (level === 2) {
    let title = 'Target Operation';
    let hintText;

    if (ruleKey === 'PARENTHESES_FIRST') {
      hintText = `Focus on the operation inside parentheses: calculate ${targetFormatted} first.`;
    } else if (ruleKey === 'PRECEDENCE_PRIORITY') {
      const opName = targetOperator === '*' ? 'multiplication' : 'division';
      hintText = `Focus on the ${opName}: calculate ${targetFormatted} before adding or subtracting.`;
    } else {
      hintText = `Focus on the first operation from the left: calculate ${targetFormatted} next.`;
    }

    return {
      level: 2,
      ruleKey,
      title,
      hintText,
      targetSubexpression: targetFormatted,
      operator: targetOperator,
      hasParallelExample: false,
      parallelExample: null,
      antiSpoilerGuarantee: true,
    };
  }

  // 7. Build Level 3: Rule Explanation + Generic Parallel Example (or safe fallback)
  let title = 'Rule Explanation & Example';
  let hintText;
  let parallelExample = null;
  let hasParallelExample = false;

  // Search candidate pool for a completely disjoint parallel example
  const candidatePool = PARALLEL_EXAMPLES[ruleCategory] || PARALLEL_EXAMPLES.LEFT_TO_RIGHT;
  if (!forceFallback) {
    for (const ex of candidatePool) {
      if (validateParallelExample(ex.numbers, forbiddenNumbers)) {
        hasParallelExample = true;
        parallelExample = {
          expression: ex.expression,
          firstStep: ex.firstStep,
          explanation: ex.explanation,
        };
        break;
      }
    }
  }

  if (hasParallelExample && parallelExample) {
    hintText = `Rule: In standard order of operations, ${
      ruleKey === 'PARENTHESES_FIRST'
        ? 'parentheses take priority over outer operations.'
        : ruleKey === 'PRECEDENCE_PRIORITY'
        ? 'multiplication and division take priority over addition and subtraction.'
        : 'equal-priority operations are calculated from left to right.'
    } For example, in ${parallelExample.expression}, we do ${parallelExample.explanation} Apply this exact same priority to your problem!`;
  } else {
    // Safe non-numerical fallback explanation when numbers cannot be verified as disjoint
    hintText = `Rule: Always calculate operations in strict PEMDAS / BODMAS priority:
1. Parentheses ( )
2. Multiplication (×) and Division (÷)
3. Addition (+) and Subtraction (-)
Solve one operation at a time without changing the order of the remaining numbers.`;
  }

  return {
    level: 3,
    ruleKey,
    title,
    hintText,
    targetSubexpression: targetFormatted,
    operator: targetOperator,
    hasParallelExample,
    parallelExample,
    antiSpoilerGuarantee: true,
  };
}
