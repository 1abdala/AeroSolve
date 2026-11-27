import { describe, it, expect } from 'vitest';
import {
  parseExpression,
  tokenize,
  formatAST,
  ParseError,
} from '../services/expressionParser';

describe('Milestone 6.1: Mathematical Expression Parser', () => {
  describe('Tokenizer (Lexical Analysis)', () => {
    it('tokenizes single digits, operators, and parentheses', () => {
      const tokens = tokenize('3 + 5 * (8 - 2) / 4');
      const types = tokens.map((t) => t.type);
      expect(types).toEqual([
        'INTEGER',
        'PLUS',
        'INTEGER',
        'STAR',
        'LPAREN',
        'INTEGER',
        'MINUS',
        'INTEGER',
        'RPAREN',
        'SLASH',
        'INTEGER',
        'EOF',
      ]);
    });

    it('groups consecutive digits into multi-digit integers without affecting single-symbol pipeline', () => {
      const tokens = tokenize('12 + 345 * 6');
      expect(tokens[0]).toEqual({ type: 'INTEGER', value: 12, raw: '12', position: 0 });
      expect(tokens[2]).toEqual({ type: 'INTEGER', value: 345, raw: '345', position: 5 });
      expect(tokens[4]).toEqual({ type: 'INTEGER', value: 6, raw: '6', position: 11 });
    });

    it('accepts array of token strings from recognition sequences', () => {
      const input = ['3', '+', '5', '*', '2'];
      const tokens = tokenize(input);
      expect(tokens.map((t) => t.raw)).toEqual(['3', '+', '5', '*', '2', '']);
      expect(tokens[0].value).toBe(3);
      expect(tokens[2].value).toBe(5);
    });

    it('groups consecutive digit items in token array into multi-digit integer', () => {
      const input = ['1', '2', '+', '3', '4', '5'];
      const tokens = tokenize(input);
      expect(tokens[0]).toEqual({ type: 'INTEGER', value: 12, raw: '12', position: 0 });
      expect(tokens[1]).toEqual({ type: 'PLUS', value: '+', raw: '+', position: 2 });
      expect(tokens[2]).toEqual({ type: 'INTEGER', value: 345, raw: '345', position: 3 });
    });

    it('normalizes multiplication and division symbol aliases (×, x, ÷)', () => {
      const tokens = tokenize('3 × 5 ÷ 2 x 4');
      expect(tokens.map((t) => t.value)).toEqual([3, '*', 5, '/', 2, '*', 4, '']);
    });

    it('throws ParseError on unrecognized characters', () => {
      expect(() => tokenize('3 + @ - 2')).toThrow(ParseError);
      expect(() => tokenize('3 + @ - 2')).toThrow(/Unrecognized character: "@"/);
    });
  });

  describe('Valid Expressions & Exact AST Structure', () => {
    it('parses single integer literal', () => {
      const ast = parseExpression('42');
      expect(ast).toEqual({
        type: 'Literal',
        value: 42,
        raw: '42',
      });
      expect(formatAST(ast)).toBe('42');
    });

    it('parses basic addition: "3 + 5"', () => {
      const ast = parseExpression('3 + 5');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'Literal', value: 3, raw: '3' },
        right: { type: 'Literal', value: 5, raw: '5' },
      });
      expect(formatAST(ast)).toBe('(+ 3 5)');
    });

    it('parses basic subtraction: "3 - 5"', () => {
      const ast = parseExpression('3 - 5');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '-',
        left: { type: 'Literal', value: 3, raw: '3' },
        right: { type: 'Literal', value: 5, raw: '5' },
      });
      expect(formatAST(ast)).toBe('(- 3 5)');
    });

    it('parses basic multiplication: "3 * 5"', () => {
      const ast = parseExpression('3 * 5');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '*',
        left: { type: 'Literal', value: 3, raw: '3' },
        right: { type: 'Literal', value: 5, raw: '5' },
      });
      expect(formatAST(ast)).toBe('(* 3 5)');
    });

    it('parses basic division: "8 / 2"', () => {
      const ast = parseExpression('8 / 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '/',
        left: { type: 'Literal', value: 8, raw: '8' },
        right: { type: 'Literal', value: 2, raw: '2' },
      });
      expect(formatAST(ast)).toBe('(/ 8 2)');
    });

    it('structurally accepts division producing non-integers without evaluation (e.g. "1 / 3", "7 / 2")', () => {
      // Must accept division expressions regardless of whether the mathematical result is an integer
      const ast1 = parseExpression('1 / 3');
      expect(ast1.type).toBe('BinaryExpression');
      expect(ast1.operator).toBe('/');
      expect(formatAST(ast1)).toBe('(/ 1 3)');

      const ast2 = parseExpression('7 / 2');
      expect(ast2.type).toBe('BinaryExpression');
      expect(ast2.operator).toBe('/');
      expect(formatAST(ast2)).toBe('(/ 7 2)');
    });
  });

  describe('Operator Precedence & Associativity', () => {
    it('enforces multiplication before addition: "3 + 5 * 2" => 3 + (5 * 2)', () => {
      const ast = parseExpression('3 + 5 * 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'Literal', value: 3, raw: '3' },
        right: {
          type: 'BinaryExpression',
          operator: '*',
          left: { type: 'Literal', value: 5, raw: '5' },
          right: { type: 'Literal', value: 2, raw: '2' },
        },
      });
      expect(formatAST(ast)).toBe('(+ 3 (* 5 2))');
    });

    it('enforces multiplication before addition when first: "3 * 5 + 2" => (3 * 5) + 2', () => {
      const ast = parseExpression('3 * 5 + 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: {
          type: 'BinaryExpression',
          operator: '*',
          left: { type: 'Literal', value: 3, raw: '3' },
          right: { type: 'Literal', value: 5, raw: '5' },
        },
        right: { type: 'Literal', value: 2, raw: '2' },
      });
      expect(formatAST(ast)).toBe('(+ (* 3 5) 2)');
    });

    it('enforces division before addition: "8 / 2 + 3" => (8 / 2) + 3', () => {
      const ast = parseExpression('8 / 2 + 3');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: {
          type: 'BinaryExpression',
          operator: '/',
          left: { type: 'Literal', value: 8, raw: '8' },
          right: { type: 'Literal', value: 2, raw: '2' },
        },
        right: { type: 'Literal', value: 3, raw: '3' },
      });
      expect(formatAST(ast)).toBe('(+ (/ 8 2) 3)');
    });

    it('enforces left-associativity for subtraction: "8 - 3 - 2" => (8 - 3) - 2', () => {
      const ast = parseExpression('8 - 3 - 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '-',
        left: {
          type: 'BinaryExpression',
          operator: '-',
          left: { type: 'Literal', value: 8, raw: '8' },
          right: { type: 'Literal', value: 3, raw: '3' },
        },
        right: { type: 'Literal', value: 2, raw: '2' },
      });
      expect(formatAST(ast)).toBe('(- (- 8 3) 2)');
    });

    it('enforces left-associativity for division: "12 / 3 / 2" => (12 / 3) / 2', () => {
      const ast = parseExpression('12 / 3 / 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '/',
        left: {
          type: 'BinaryExpression',
          operator: '/',
          left: { type: 'Literal', value: 12, raw: '12' },
          right: { type: 'Literal', value: 3, raw: '3' },
        },
        right: { type: 'Literal', value: 2, raw: '2' },
      });
      expect(formatAST(ast)).toBe('(/ (/ 12 3) 2)');
    });
  });

  describe('Parentheses & Nested Grouping', () => {
    it('allows parentheses to override precedence: "(3 + 5) * 2"', () => {
      const ast = parseExpression('(3 + 5) * 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '*',
        left: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Literal', value: 3, raw: '3' },
          right: { type: 'Literal', value: 5, raw: '5' },
        },
        right: { type: 'Literal', value: 2, raw: '2' },
      });
      expect(formatAST(ast)).toBe('(* (+ 3 5) 2)');
    });

    it('parses parenthesized divisor: "8 / (2 + 2)"', () => {
      const ast = parseExpression('8 / (2 + 2)');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '/',
        left: { type: 'Literal', value: 8, raw: '8' },
        right: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Literal', value: 2, raw: '2' },
          right: { type: 'Literal', value: 2, raw: '2' },
        },
      });
      expect(formatAST(ast)).toBe('(/ 8 (+ 2 2))');
    });

    it('parses nested parentheses: "((2 + 3) * 4) - 5"', () => {
      const ast = parseExpression('((2 + 3) * 4) - 5');
      expect(formatAST(ast)).toBe('(- (* (+ 2 3) 4) 5)');
    });

    it('parses deeply nested parentheses: "(2 * (3 + (4 - 1)))"', () => {
      const ast = parseExpression('(2 * (3 + (4 - 1)))');
      expect(formatAST(ast)).toBe('(* 2 (+ 3 (- 4 1)))');
    });

    it('parses multi-digit numbers combined with parentheses: "((12 + 34) * 56) / 78"', () => {
      const ast = parseExpression('((12 + 34) * 56) / 78');
      expect(formatAST(ast)).toBe('(/ (* (+ 12 34) 56) 78)');
    });
  });

  describe('Malformed & Invalid Expressions (Error Handling)', () => {
    it('rejects empty input with descriptive error', () => {
      expect(() => parseExpression('')).toThrow(ParseError);
      expect(() => parseExpression('')).toThrow(/cannot be empty/);
      expect(() => parseExpression('   ')).toThrow(ParseError);
      expect(() => parseExpression([])).toThrow(ParseError);
      expect(() => parseExpression(null)).toThrow(ParseError);
    });

    it('rejects trailing operators: "3 +" and "8 /"', () => {
      expect(() => parseExpression('3 +')).toThrow(ParseError);
      expect(() => parseExpression('3 +')).toThrow(/expected operand after "\+"/);
      expect(() => parseExpression('8 /')).toThrow(ParseError);
      expect(() => parseExpression('8 /')).toThrow(/expected operand after "\/"/);
    });

    it('rejects leading binary operators: "* 3" and "+ 5"', () => {
      expect(() => parseExpression('* 3')).toThrow(ParseError);
      expect(() => parseExpression('* 3')).toThrow(/Unexpected operator "\*" at start/);
      expect(() => parseExpression('+ 5')).toThrow(ParseError);
      expect(() => parseExpression('+ 5')).toThrow(/Unexpected operator "\+" at start/);
    });

    it('rejects unary minus with clear descriptive limitation message: "-5 + 2"', () => {
      expect(() => parseExpression('-5 + 2')).toThrow(ParseError);
      expect(() => parseExpression('-5 + 2')).toThrow(/Unary operators.*are not supported in Milestone 6.1/);
    });

    it('rejects consecutive operators: "3 + * 2" and "8 / - 2"', () => {
      expect(() => parseExpression('3 + * 2')).toThrow(ParseError);
      expect(() => parseExpression('3 + * 2')).toThrow(/Unexpected consecutive operator "\*" after "\+"/);
      expect(() => parseExpression('8 / - 2')).toThrow(ParseError);
      expect(() => parseExpression('8 / - 2')).toThrow(/Unary minus following operator "\/" is not supported/);
    });

    it('rejects unmatched opening parentheses: "(3 + 5" and "((2 + 3)"', () => {
      expect(() => parseExpression('(3 + 5')).toThrow(ParseError);
      expect(() => parseExpression('(3 + 5')).toThrow(/Unmatched opening parenthesis/);
      expect(() => parseExpression('((2 + 3)')).toThrow(ParseError);
    });

    it('rejects unmatched closing parentheses: "3 + 5)" and ")"', () => {
      expect(() => parseExpression('3 + 5)')).toThrow(ParseError);
      expect(() => parseExpression('3 + 5)')).toThrow(/Unmatched closing parenthesis/);
      expect(() => parseExpression(')')).toThrow(ParseError);
    });

    it('rejects empty parentheses: "3 + () * 2"', () => {
      expect(() => parseExpression('3 + () * 2')).toThrow(ParseError);
      expect(() => parseExpression('3 + () * 2')).toThrow(/Empty parentheses/);
    });

    it('rejects consecutive numbers separated by whitespace without an operator: "3 5 +"', () => {
      expect(() => parseExpression('3 5 +')).toThrow(ParseError);
      expect(() => parseExpression('3 5 +')).toThrow(/Unexpected number "5" without an operator/);
    });

    it('rejects consecutive standalone operand tokens: "2 3"', () => {
      expect(() => parseExpression('2 3')).toThrow(ParseError);
      expect(() => parseExpression('2 3')).toThrow(/Unexpected number "3" without an operator/);
    });

    it('rejects invalid characters in expression', () => {
      expect(() => parseExpression('3 + @ - 2')).toThrow(ParseError);
      expect(() => parseExpression('5 & 2')).toThrow(ParseError);
    });
  });
});
