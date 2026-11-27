/**
 * AeroSolve — Milestone 6.2: AST Evaluator & Step-by-Step Reduction Engine
 *
 * Implements an isolated, deterministic AST evaluator that takes an Abstract Syntax Tree (AST)
 * produced by the Milestone 6.1 parser, evaluates arithmetic operations respecting operator
 * precedence and parentheses, and records structured intermediate reduction steps and the final result.
 *
 * Scope & Guarantees:
 * 1. AST Validation: Validates incoming AST structure before evaluation.
 * 2. Immutable Reduction: Deep-clones the AST and does not mutate input trees.
 * 3. Step Recording: Captures stepIndex, operator, operands, raw subResult, formattedSubResult,
 *    operation string, beforeExpression, afterExpression, astBefore, and astAfter for every reduction.
 * 4. Raw Numerical Preservation: Preserves raw JavaScript IEEE 754 Number values during all
 *    intermediate steps; no generic epsilon rounding or lossy snapping is applied internally.
 * 5. Display-Only Formatting: Floating-point representation noise (e.g. 0.1 + 0.2 = 0.30000000000000004)
 *    is cleaned up solely in formatted display properties.
 * 6. Strict Division by Zero: Rejects rightOperand === 0 (+0 and -0) while accepting tiny non-zero values.
 * 7. Non-Finite Guard: Catches overflow, NaN, and non-finite computations explicitly.
 */

import { parseExpression } from './expressionParser.js';

/**
 * Custom Evaluation Error carrying error code and context details.
 */
export class EvaluationError extends Error {
  constructor(message, code = 'EVALUATION_ERROR', details = {}) {
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Format a number for human-readable display without altering internal calculation values.
 * Trims IEEE-754 representation noise for display while maintaining true value.
 *
 * @param {number} num - Raw JavaScript number
 * @param {number} maxDecimals - Maximum decimal places to show before trimming (default: 6)
 * @returns {string} Formatted number string
 */
export function formatDisplayNumber(num, maxDecimals = 6) {
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return String(num);
  }

  // Normalize negative zero
  if (Object.is(num, -0) || num === 0) {
    return '0';
  }

  if (Number.isInteger(num)) {
    return String(num);
  }

  // Clean IEEE 754 representation noise (e.g. 0.1 + 0.2 -> 0.3)
  const precisionCleaned = Number(num.toPrecision(12));
  if (Number.isInteger(precisionCleaned)) {
    return String(precisionCleaned);
  }

  const cleanStr = precisionCleaned.toString();

  // Preserve scientific notation as-is (e.g. 1e-16)
  if (cleanStr.includes('e') || cleanStr.includes('E')) {
    return cleanStr;
  }

  if (!cleanStr.includes('.')) {
    return cleanStr;
  }

  const [, decPart] = cleanStr.split('.');
  if (decPart.length <= maxDecimals) {
    return cleanStr;
  }

  return Number(precisionCleaned.toFixed(maxDecimals)).toString();
}

/**
 * Validate an AST structure recursively to ensure it conforms to Milestone 6.1/6.2 specifications.
 *
 * @param {object} node - AST Node
 * @returns {boolean} True if valid; throws EvaluationError otherwise.
 */
export function validateAST(node) {
  if (!node || typeof node !== 'object') {
    throw new EvaluationError('AST node cannot be null or undefined', 'INVALID_AST', { node });
  }

  if (typeof node.type !== 'string') {
    throw new EvaluationError('AST node must have a type property', 'INVALID_AST', { node });
  }

  if (node.type === 'Literal') {
    if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
      throw new EvaluationError('Literal node must have a finite numerical value', 'INVALID_AST', { node });
    }
    return true;
  }

  if (node.type === 'BinaryExpression') {
    if (!['+', '-', '*', '/'].includes(node.operator)) {
      throw new EvaluationError(`Unsupported operator "${node.operator}" in BinaryExpression`, 'UNSUPPORTED_OPERATOR', { node });
    }
    if (!node.left) {
      throw new EvaluationError('BinaryExpression missing left child node', 'INVALID_AST', { node });
    }
    if (!node.right) {
      throw new EvaluationError('BinaryExpression missing right child node', 'INVALID_AST', { node });
    }
    validateAST(node.left);
    validateAST(node.right);
    return true;
  }

  throw new EvaluationError(`Unsupported AST node type "${node.type}"`, 'UNSUPPORTED_NODE', { node });
}

/**
 * Deep-clone an AST to guarantee immutability during evaluation.
 *
 * @param {object} node - AST Node
 * @returns {object} Deep copy of node
 */
export function cloneAST(node) {
  if (!node || typeof node !== 'object') return node;

  if (node.type === 'Literal') {
    return {
      type: 'Literal',
      value: node.value,
      raw: node.raw ?? String(node.value),
    };
  }

  if (node.type === 'BinaryExpression') {
    return {
      type: 'BinaryExpression',
      operator: node.operator,
      left: cloneAST(node.left),
      right: cloneAST(node.right),
    };
  }

  return { ...node };
}

/**
 * Serialize an AST node back into a readable infix expression string with minimal necessary parentheses.
 *
 * @param {object} node - AST Node
 * @param {object|null} parent - Parent node (if any)
 * @param {boolean} isRight - Whether this node is the right child of parent
 * @returns {string} Infix expression string
 */
export function astToInfix(node, parent = null, isRight = false) {
  if (!node) return '';

  if (node.type === 'Literal') {
    if (node.value < 0 && parent) {
      return `(${formatDisplayNumber(node.value)})`;
    }
    return formatDisplayNumber(node.value);
  }

  if (node.type === 'BinaryExpression') {
    const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const myPrec = prec[node.operator] || 0;
    const parentPrec = parent ? (prec[parent.operator] || 0) : 0;

    const leftStr = astToInfix(node.left, node, false);
    const rightStr = astToInfix(node.right, node, true);
    const expr = `${leftStr} ${node.operator} ${rightStr}`;

    if (!parent) {
      return expr;
    }

    let needsParens = false;
    if (myPrec < parentPrec) {
      needsParens = true;
    } else if (myPrec === parentPrec) {
      // Left-associative operator disambiguation on the right child:
      // e.g. a - (b - c) or a / (b / c) or a - (b + c) or a / (b * c)
      if (isRight && (parent.operator === '-' || parent.operator === '/')) {
        needsParens = true;
      }
    }

    return needsParens ? `(${expr})` : expr;
  }

  return '';
}

/**
 * Locate the next reducible sub-expression (redex) in post-order (left, right).
 * A reducible expression is a BinaryExpression whose left and right children are both Literals.
 *
 * @param {object} node - AST Node
 * @returns {object|null} Next reducible BinaryExpression node or null
 */
export function findNextReducibleNode(node) {
  if (!node || node.type !== 'BinaryExpression') {
    return null;
  }

  // Check left subtree first
  if (node.left && node.left.type === 'BinaryExpression') {
    const foundLeft = findNextReducibleNode(node.left);
    if (foundLeft) return foundLeft;
  }

  // Check right subtree next
  if (node.right && node.right.type === 'BinaryExpression') {
    const foundRight = findNextReducibleNode(node.right);
    if (foundRight) return foundRight;
  }

  // If both left and right are Literals, this node is reducible
  if (node.left?.type === 'Literal' && node.right?.type === 'Literal') {
    return node;
  }

  return null;
}

/**
 * Immutably replace targetNode within tree with replacementNode.
 *
 * @param {object} tree - AST Node
 * @param {object} targetNode - Target node reference to replace
 * @param {object} replacementNode - New node to insert
 * @returns {object} Updated AST tree
 */
export function replaceNode(tree, targetNode, replacementNode) {
  if (tree === targetNode) {
    return replacementNode;
  }

  if (!tree || tree.type !== 'BinaryExpression') {
    return tree;
  }

  return {
    ...tree,
    left: replaceNode(tree.left, targetNode, replacementNode),
    right: replaceNode(tree.right, targetNode, replacementNode),
  };
}

/**
 * Primary public API: Evaluate an AST and generate structured step-by-step reduction records.
 *
 * @param {object} ast - Input AST root node
 * @param {object} [options] - Optional evaluation settings
 * @param {number} [options.maxDecimals=6] - Max decimal places for display formatting
 * @param {number} [options.maxSteps=1000] - Safety cap on reduction steps
 * @returns {{
 *   result: number,
 *   formattedResult: string,
 *   isInteger: boolean,
 *   steps: Array<object>,
 *   expression: string,
 *   stepCount: number
 * }}
 */
export function evaluateAST(ast, options = {}) {
  validateAST(ast);

  const maxDecimals = options.maxDecimals ?? 6;
  const maxSteps = options.maxSteps ?? 1000;

  let currentTree = cloneAST(ast);
  const initialExpression = astToInfix(currentTree);

  // If the AST is already a single literal, return immediately with 0 steps
  if (currentTree.type === 'Literal') {
    const val = currentTree.value;
    return {
      result: val,
      formattedResult: formatDisplayNumber(val, maxDecimals),
      isInteger: Number.isInteger(val),
      steps: [],
      expression: initialExpression,
      stepCount: 0,
    };
  }

  const steps = [];

  while (currentTree.type !== 'Literal') {
    if (steps.length >= maxSteps) {
      throw new EvaluationError(
        `Maximum reduction steps (${maxSteps}) exceeded; possible cycle or oversized tree`,
        'MAX_STEPS_EXCEEDED',
        { maxSteps }
      );
    }

    const redex = findNextReducibleNode(currentTree);
    if (!redex) {
      throw new EvaluationError(
        'Malformed AST: Unable to locate next reducible expression',
        'MALFORMED_AST',
        { currentTree }
      );
    }

    const { operator, left, right } = redex;
    const leftOperand = left.value;
    const rightOperand = right.value;

    // Strict division by zero detection
    if (operator === '/' && rightOperand === 0) {
      throw new EvaluationError(
        'Division by zero is undefined',
        'DIVISION_BY_ZERO',
        {
          stepIndex: steps.length + 1,
          operator: '/',
          leftOperand,
          rightOperand,
        }
      );
    }

    // Perform raw arithmetic calculation
    let subResult;
    switch (operator) {
      case '+':
        subResult = leftOperand + rightOperand;
        break;
      case '-':
        subResult = leftOperand - rightOperand;
        break;
      case '*':
        subResult = leftOperand * rightOperand;
        break;
      case '/':
        subResult = leftOperand / rightOperand;
        break;
      default:
        throw new EvaluationError(
          `Unsupported operator "${operator}" encountered during reduction`,
          'UNSUPPORTED_OPERATOR',
          { operator }
        );
    }

    // Verify numerical finiteness
    if (!Number.isFinite(subResult)) {
      throw new EvaluationError(
        `Calculation produced non-finite result: ${subResult}`,
        'NON_FINITE_RESULT',
        {
          stepIndex: steps.length + 1,
          operator,
          leftOperand,
          rightOperand,
          subResult,
        }
      );
    }

    const formatOperand = (val) => (val < 0 ? `(${formatDisplayNumber(val, maxDecimals)})` : formatDisplayNumber(val, maxDecimals));
    const formattedSubResult = formatDisplayNumber(subResult, maxDecimals);

    const replacementNode = {
      type: 'Literal',
      value: subResult,
      raw: String(subResult),
    };

    const nextTree = replaceNode(currentTree, redex, replacementNode);

    const stepRecord = {
      stepIndex: steps.length + 1,
      operator,
      leftOperand,
      rightOperand,
      subResult,
      formattedSubResult,
      operation: `${formatOperand(leftOperand)} ${operator} ${formatOperand(rightOperand)} = ${formattedSubResult}`,
      beforeExpression: astToInfix(currentTree),
      afterExpression: astToInfix(nextTree),
      astBefore: cloneAST(currentTree),
      astAfter: cloneAST(nextTree),
    };

    steps.push(stepRecord);
    currentTree = nextTree;
  }

  const finalValue = currentTree.value;

  return {
    result: finalValue,
    formattedResult: formatDisplayNumber(finalValue, maxDecimals),
    isInteger: Number.isInteger(finalValue),
    steps,
    expression: initialExpression,
    stepCount: steps.length,
  };
}

/**
 * End-to-end convenience API: Parse and evaluate an expression string or token array.
 *
 * @param {string | Array<string | { value?: string, label?: string }>} input - Expression input
 * @param {object} [options] - Evaluation options
 * @returns {{
 *   result: number,
 *   formattedResult: string,
 *   isInteger: boolean,
 *   steps: Array<object>,
 *   expression: string,
 *   stepCount: number
 * }}
 */
export function evaluateExpression(input, options = {}) {
  const ast = parseExpression(input);
  return evaluateAST(ast, options);
}
