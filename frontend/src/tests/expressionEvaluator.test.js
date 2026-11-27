/**
 * AeroSolve — Milestone 6.2: AST Evaluator & Step-by-Step Reduction Engine Tests
 */

import { describe, it, expect } from 'vitest';
import { parseExpression } from '../services/expressionParser.js';
import {
  evaluateAST,
  evaluateExpression,
  EvaluationError,
  validateAST,
  formatDisplayNumber,
  astToInfix,
  cloneAST,
  findNextReducibleNode,
  replaceNode,
} from '../services/expressionEvaluator.js';

describe('Milestone 6.2: AST Evaluator & Reduction Engine', () => {
  describe('formatDisplayNumber', () => {
    it('formats integers without decimals', () => {
      expect(formatDisplayNumber(0)).toBe('0');
      expect(formatDisplayNumber(42)).toBe('42');
      expect(formatDisplayNumber(-15)).toBe('-15');
    });

    it('normalizes negative zero to "0"', () => {
      expect(formatDisplayNumber(-0)).toBe('0');
      expect(formatDisplayNumber(+0)).toBe('0');
    });

    it('cleans floating point representation drift for display while preserving precision', () => {
      // 0.1 + 0.2 in JS evaluates to 0.30000000000000004
      const sum = 0.1 + 0.2;
      expect(sum).toBe(0.30000000000000004);
      expect(formatDisplayNumber(sum)).toBe('0.3');
    });

    it('handles finite non-integer decimals within maxDecimals', () => {
      expect(formatDisplayNumber(3.5)).toBe('3.5');
      expect(formatDisplayNumber(0.125)).toBe('0.125');
      expect(formatDisplayNumber(-4.75)).toBe('-4.75');
    });

    it('trims long repeating decimals to maxDecimals', () => {
      const third = 1 / 3; // 0.3333333333333333
      expect(formatDisplayNumber(third, 6)).toBe('0.333333');
      expect(formatDisplayNumber(third, 2)).toBe('0.33');
    });

    it('preserves scientific notation numbers cleanly', () => {
      expect(formatDisplayNumber(1e-16)).toBe('1e-16');
      expect(formatDisplayNumber(1e20)).toBe('100000000000000000000');
    });

    it('safely handles non-finite inputs', () => {
      expect(formatDisplayNumber(Infinity)).toBe('Infinity');
      expect(formatDisplayNumber(-Infinity)).toBe('-Infinity');
      expect(formatDisplayNumber(NaN)).toBe('NaN');
    });
  });

  describe('AST Validation (validateAST)', () => {
    it('accepts valid Literal nodes', () => {
      expect(validateAST({ type: 'Literal', value: 5, raw: '5' })).toBe(true);
      expect(validateAST({ type: 'Literal', value: 0, raw: '0' })).toBe(true);
      expect(validateAST({ type: 'Literal', value: -7.5, raw: '-7.5' })).toBe(true);
    });

    it('accepts valid BinaryExpression nodes', () => {
      const ast = {
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'Literal', value: 2, raw: '2' },
        right: { type: 'Literal', value: 3, raw: '3' },
      };
      expect(validateAST(ast)).toBe(true);
    });

    it('rejects null or non-object AST', () => {
      expect(() => validateAST(null)).toThrow(EvaluationError);
      expect(() => validateAST(undefined)).toThrow(EvaluationError);
      expect(() => validateAST('invalid')).toThrow(EvaluationError);
    });

    it('rejects nodes with missing or invalid type', () => {
      expect(() => validateAST({})).toThrow(EvaluationError);
      expect(() => validateAST({ type: 123 })).toThrow(EvaluationError);
    });

    it('rejects Literals with non-finite or non-numeric values', () => {
      expect(() => validateAST({ type: 'Literal', value: '42' })).toThrow(EvaluationError);
      expect(() => validateAST({ type: 'Literal', value: NaN })).toThrow(EvaluationError);
      expect(() => validateAST({ type: 'Literal', value: Infinity })).toThrow(EvaluationError);
    });

    it('rejects BinaryExpressions with invalid operators or missing children', () => {
      expect(() =>
        validateAST({
          type: 'BinaryExpression',
          operator: '%',
          left: { type: 'Literal', value: 2 },
          right: { type: 'Literal', value: 3 },
        })
      ).toThrow(EvaluationError);

      expect(() =>
        validateAST({
          type: 'BinaryExpression',
          operator: '+',
          left: null,
          right: { type: 'Literal', value: 3 },
        })
      ).toThrow(EvaluationError);

      expect(() =>
        validateAST({
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Literal', value: 2 },
          right: undefined,
        })
      ).toThrow(EvaluationError);
    });

    it('rejects unsupported node types', () => {
      expect(() => validateAST({ type: 'UnaryExpression', operator: '-', argument: { type: 'Literal', value: 5 } }))
        .toThrow(EvaluationError);
      expect(() => validateAST({ type: 'Identifier', name: 'x' })).toThrow(EvaluationError);
    });
  });

  describe('AST Utilities (cloneAST, astToInfix, findNextReducibleNode, replaceNode)', () => {
    it('deep-clones an AST preserving values and structure', () => {
      const original = {
        type: 'BinaryExpression',
        operator: '*',
        left: { type: 'Literal', value: 4, raw: '4' },
        right: { type: 'Literal', value: 5, raw: '5' },
      };
      const copy = cloneAST(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy.left).not.toBe(original.left);
      expect(copy.right).not.toBe(original.right);
    });

    it('converts AST to infix string with minimal necessary parentheses', () => {
      expect(astToInfix({ type: 'Literal', value: 42 })).toBe('42');

      const addMul = parseExpression('3 + 5 * 2');
      expect(astToInfix(addMul)).toBe('3 + 5 * 2');

      const parenMul = parseExpression('(3 + 5) * 2');
      expect(astToInfix(parenMul)).toBe('(3 + 5) * 2');

      const leftSub = parseExpression('8 - 3 - 2');
      expect(astToInfix(leftSub)).toBe('8 - 3 - 2');

      const rightSub = parseExpression('8 - (3 - 2)');
      expect(astToInfix(rightSub)).toBe('8 - (3 - 2)');

      const rightDiv = parseExpression('12 / (4 / 2)');
      expect(astToInfix(rightDiv)).toBe('12 / (4 / 2)');
    });

    it('finds the next innermost reducible node in post-order', () => {
      const ast = parseExpression('3 + 5 * 2');
      const redex = findNextReducibleNode(ast);

      expect(redex).not.toBeNull();
      expect(redex.operator).toBe('*');
      expect(redex.left.value).toBe(5);
      expect(redex.right.value).toBe(2);
    });

    it('immutably replaces target node within an AST tree', () => {
      const ast = parseExpression('3 + 5 * 2');
      const redex = findNextReducibleNode(ast);
      const replacement = { type: 'Literal', value: 10, raw: '10' };

      const updated = replaceNode(ast, redex, replacement);

      expect(updated).not.toBe(ast);
      expect(updated.operator).toBe('+');
      expect(updated.left.value).toBe(3);
      expect(updated.right.value).toBe(10);
      // Original remains untouched
      expect(ast.right.operator).toBe('*');
    });
  });

  describe('Basic Arithmetic Evaluation', () => {
    it('evaluates single addition', () => {
      const res = evaluateExpression('3 + 5');
      expect(res.result).toBe(8);
      expect(res.formattedResult).toBe('8');
      expect(res.isInteger).toBe(true);
      expect(res.stepCount).toBe(1);
      expect(res.steps[0]).toMatchObject({
        stepIndex: 1,
        operator: '+',
        leftOperand: 3,
        rightOperand: 5,
        subResult: 8,
        formattedSubResult: '8',
        operation: '3 + 5 = 8',
        beforeExpression: '3 + 5',
        afterExpression: '8',
      });
    });

    it('evaluates single subtraction', () => {
      const res = evaluateExpression('10 - 4');
      expect(res.result).toBe(6);
      expect(res.formattedResult).toBe('6');
      expect(res.isInteger).toBe(true);
      expect(res.stepCount).toBe(1);
      expect(res.steps[0].operation).toBe('10 - 4 = 6');
    });

    it('evaluates single multiplication', () => {
      const res = evaluateExpression('6 * 7');
      expect(res.result).toBe(42);
      expect(res.formattedResult).toBe('42');
      expect(res.isInteger).toBe(true);
      expect(res.stepCount).toBe(1);
      expect(res.steps[0].operation).toBe('6 * 7 = 42');
    });

    it('evaluates single division', () => {
      const res = evaluateExpression('24 / 6');
      expect(res.result).toBe(4);
      expect(res.formattedResult).toBe('4');
      expect(res.isInteger).toBe(true);
      expect(res.stepCount).toBe(1);
      expect(res.steps[0].operation).toBe('24 / 6 = 4');
    });

    it('handles single literal without any steps', () => {
      const res = evaluateExpression('42');
      expect(res.result).toBe(42);
      expect(res.formattedResult).toBe('42');
      expect(res.isInteger).toBe(true);
      expect(res.stepCount).toBe(0);
      expect(res.steps).toEqual([]);
      expect(res.expression).toBe('42');
    });
  });

  describe('Precedence, Associativity, and Step-by-Step Reduction', () => {
    it('evaluates multiplication before addition (3 + 5 * 2)', () => {
      const res = evaluateExpression('3 + 5 * 2');
      expect(res.result).toBe(13);
      expect(res.stepCount).toBe(2);

      expect(res.steps[0]).toMatchObject({
        stepIndex: 1,
        operator: '*',
        leftOperand: 5,
        rightOperand: 2,
        subResult: 10,
        beforeExpression: '3 + 5 * 2',
        afterExpression: '3 + 10',
      });

      expect(res.steps[1]).toMatchObject({
        stepIndex: 2,
        operator: '+',
        leftOperand: 3,
        rightOperand: 10,
        subResult: 13,
        beforeExpression: '3 + 10',
        afterExpression: '13',
      });
    });

    it('evaluates parentheses override precedence ((3 + 5) * 2)', () => {
      const res = evaluateExpression('(3 + 5) * 2');
      expect(res.result).toBe(16);
      expect(res.stepCount).toBe(2);

      expect(res.steps[0]).toMatchObject({
        stepIndex: 1,
        operator: '+',
        leftOperand: 3,
        rightOperand: 5,
        subResult: 8,
        beforeExpression: '(3 + 5) * 2',
        afterExpression: '8 * 2',
      });

      expect(res.steps[1]).toMatchObject({
        stepIndex: 2,
        operator: '*',
        leftOperand: 8,
        rightOperand: 2,
        subResult: 16,
        beforeExpression: '8 * 2',
        afterExpression: '16',
      });
    });

    it('evaluates left-associative subtraction left-to-right (10 - 4 - 2)', () => {
      const res = evaluateExpression('10 - 4 - 2');
      expect(res.result).toBe(4);
      expect(res.stepCount).toBe(2);

      expect(res.steps[0].operation).toBe('10 - 4 = 6');
      expect(res.steps[0].afterExpression).toBe('6 - 2');

      expect(res.steps[1].operation).toBe('6 - 2 = 4');
      expect(res.steps[1].afterExpression).toBe('4');
    });

    it('evaluates left-associative division left-to-right (24 / 4 / 2)', () => {
      const res = evaluateExpression('24 / 4 / 2');
      expect(res.result).toBe(3);
      expect(res.stepCount).toBe(2);

      expect(res.steps[0].operation).toBe('24 / 4 = 6');
      expect(res.steps[1].operation).toBe('6 / 2 = 3');
    });

    it('evaluates multi-term mixed precedence (2 * 3 + 4 * 5)', () => {
      const res = evaluateExpression('2 * 3 + 4 * 5');
      expect(res.result).toBe(26);
      expect(res.stepCount).toBe(3);

      expect(res.steps[0].operation).toBe('2 * 3 = 6');
      expect(res.steps[0].afterExpression).toBe('6 + 4 * 5');

      expect(res.steps[1].operation).toBe('4 * 5 = 20');
      expect(res.steps[1].afterExpression).toBe('6 + 20');

      expect(res.steps[2].operation).toBe('6 + 20 = 26');
      expect(res.steps[2].afterExpression).toBe('26');
    });

    it('evaluates nested parentheses ((2 + 3) * (4 + 1)) / 5', () => {
      const res = evaluateExpression('((2 + 3) * (4 + 1)) / 5');
      expect(res.result).toBe(5);
      expect(res.stepCount).toBe(4);

      expect(res.steps[0].operation).toBe('2 + 3 = 5');
      expect(res.steps[1].operation).toBe('4 + 1 = 5');
      expect(res.steps[2].operation).toBe('5 * 5 = 25');
      expect(res.steps[3].operation).toBe('25 / 5 = 5');
    });
  });

  describe('Negative Numbers and Subtraction Order', () => {
    it('handles subtraction yielding a negative result (3 - 8)', () => {
      const res = evaluateExpression('3 - 8');
      expect(res.result).toBe(-5);
      expect(res.formattedResult).toBe('-5');
      expect(res.isInteger).toBe(true);
      expect(res.steps[0].operation).toBe('3 - 8 = -5');
    });

    it('handles chained operations with intermediate negative values ((3 - 8) * 4)', () => {
      const res = evaluateExpression('(3 - 8) * 4');
      expect(res.result).toBe(-20);
      expect(res.formattedResult).toBe('-20');
      expect(res.stepCount).toBe(2);
      expect(res.steps[0].operation).toBe('3 - 8 = -5');
      expect(res.steps[1].operation).toBe('(-5) * 4 = -20');
    });
  });

  describe('Division by Zero Detection', () => {
    it('throws DIVISION_BY_ZERO on direct zero denominator (8 / 0)', () => {
      expect(() => evaluateExpression('8 / 0')).toThrowError(EvaluationError);
      try {
        evaluateExpression('8 / 0');
      } catch (err) {
        expect(err.code).toBe('DIVISION_BY_ZERO');
        expect(err.details.operator).toBe('/');
        expect(err.details.rightOperand).toBe(0);
        expect(err.details.stepIndex).toBe(1);
      }
    });

    it('throws DIVISION_BY_ZERO on negative zero denominator (8 / -0)', () => {
      const ast = {
        type: 'BinaryExpression',
        operator: '/',
        left: { type: 'Literal', value: 8 },
        right: { type: 'Literal', value: -0 },
      };
      expect(() => evaluateAST(ast)).toThrowError(EvaluationError);
      try {
        evaluateAST(ast);
      } catch (err) {
        expect(err.code).toBe('DIVISION_BY_ZERO');
      }
    });

    it('throws DIVISION_BY_ZERO on computed zero denominator (8 / (5 - 5))', () => {
      expect(() => evaluateExpression('8 / (5 - 5)')).toThrowError(EvaluationError);
      try {
        evaluateExpression('8 / (5 - 5)');
      } catch (err) {
        expect(err.code).toBe('DIVISION_BY_ZERO');
        expect(err.details.stepIndex).toBe(2); // Step 1: 5 - 5 = 0; Step 2 attempts 8 / 0
      }
    });

    it('does NOT reject small non-zero denominators (e.g. 1e-16)', () => {
      const ast = {
        type: 'BinaryExpression',
        operator: '/',
        left: { type: 'Literal', value: 1 },
        right: { type: 'Literal', value: 1e-16 },
      };
      const res = evaluateAST(ast);
      expect(res.result).toBe(1e16);
      expect(res.isInteger).toBe(true);
    });
  });

  describe('Numerical Precision Policy & Floating-Point Representation', () => {
    it('preserves raw IEEE 754 value while cleaning display representation (0.1 + 0.2)', () => {
      const ast = {
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'Literal', value: 0.1 },
        right: { type: 'Literal', value: 0.2 },
      };
      const res = evaluateAST(ast);

      // Raw value preserves IEEE 754 precision exactly
      expect(res.result).toBe(0.1 + 0.2);
      expect(res.result).toBe(0.30000000000000004);

      // Display formatting cleans representation noise
      expect(res.formattedResult).toBe('0.3');
    });

    it('handles non-integer division (7 / 2 = 3.5)', () => {
      const res = evaluateExpression('7 / 2');
      expect(res.result).toBe(3.5);
      expect(res.formattedResult).toBe('3.5');
      expect(res.isInteger).toBe(false);
    });

    it('handles repeating decimals without loss of raw precision (1 / 3)', () => {
      const res = evaluateExpression('1 / 3');
      expect(res.result).toBe(1 / 3);
      expect(res.formattedResult).toBe('0.333333');
      expect(res.isInteger).toBe(false);
    });

    it('preserves precision in multi-step calculations ((1 / 3) * 3 = 1)', () => {
      const res = evaluateExpression('(1 / 3) * 3');
      expect(res.result).toBe(1);
      expect(res.formattedResult).toBe('1');
      expect(res.isInteger).toBe(true);
    });
  });

  describe('Non-Finite Result Handling', () => {
    it('throws NON_FINITE_RESULT when computation overflows to Infinity', () => {
      const ast = {
        type: 'BinaryExpression',
        operator: '*',
        left: { type: 'Literal', value: 1e308 },
        right: { type: 'Literal', value: 10 },
      };
      expect(() => evaluateAST(ast)).toThrowError(EvaluationError);
      try {
        evaluateAST(ast);
      } catch (err) {
        expect(err.code).toBe('NON_FINITE_RESULT');
        expect(err.details.subResult).toBe(Infinity);
      }
    });
  });

  describe('Input Immutability Guarantee', () => {
    it('guarantees that the input AST is not mutated during evaluation', () => {
      const originalAST = parseExpression('(4 + 6) * 5');
      const astSnapshot = JSON.stringify(originalAST);

      const res = evaluateAST(originalAST);

      expect(res.result).toBe(50);
      expect(JSON.stringify(originalAST)).toBe(astSnapshot);
    });
  });

  describe('Token Sequence & Symbol Item Input Handling', () => {
    it('evaluates token sequence with multi-digit integer grouping', () => {
      const res = evaluateExpression(['1', '2', '+', '3', '4']);
      expect(res.result).toBe(46);
      expect(res.stepCount).toBe(1);
      expect(res.steps[0].operation).toBe('12 + 34 = 46');
    });

    it('evaluates object token array with alternative operators (×, ÷)', () => {
      const tokens = [
        { value: '1' },
        { value: '0' },
        { value: '×' },
        { value: '5' },
      ];
      const res = evaluateExpression(tokens);
      expect(res.result).toBe(50);
      expect(res.steps[0].operation).toBe('10 * 5 = 50');
    });
  });
});
