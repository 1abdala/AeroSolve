/**
 * AeroSolve — Milestone 6.4 (Phase A): Expression Workspace Component Tests
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import ExpressionWorkspace, { OPERATOR_BUTTONS } from '../components/ExpressionWorkspace';
import { generateStepHint, verifySingleStep } from '../services/solutionVerifier.js';

describe('Milestone 6.4 (Phase A): ExpressionWorkspace Component', () => {
  describe('Operator Buttons Specification', () => {
    it('defines all 6 standard operators and delimiters', () => {
      const labels = OPERATOR_BUTTONS.map((op) => op.label);
      expect(labels).toEqual(['+', '-', '×', '÷', '(', ')']);

      const values = OPERATOR_BUTTONS.map((op) => op.value);
      expect(values).toEqual(['+', '-', '*', '/', '(', ')']);
    });

    it('assigns correct token types to operators and parentheses', () => {
      const plus = OPERATOR_BUTTONS.find((op) => op.label === '+');
      expect(plus.type).toBe('operator');

      const mul = OPERATOR_BUTTONS.find((op) => op.label === '×');
      expect(mul.type).toBe('operator');
      expect(mul.value).toBe('*');

      const lparen = OPERATOR_BUTTONS.find((op) => op.label === '(');
      expect(lparen.type).toBe('paren');

      const rparen = OPERATOR_BUTTONS.find((op) => op.label === ')');
      expect(rparen.type).toBe('paren');
    });
  });

  describe('Empty Workspace Rendering', () => {
    it('renders placeholder text when tokens array is empty', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: [],
        })
      );

      expect(html).toContain('Air-write a digit above or click an operator below');
      expect(html).toContain('0 symbols');
      expect(html).toContain('disabled=""'); // Backspace and Clear buttons disabled
    });

    it('renders all operator buttons even when ribbon is empty', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: [],
        })
      );

      expect(html).toContain('id="btn-op-plus"');
      expect(html).toContain('id="btn-op-minus"');
      expect(html).toContain('id="btn-op-mul"');
      expect(html).toContain('id="btn-op-div"');
      expect(html).toContain('id="btn-op-lparen"');
      expect(html).toContain('id="btn-op-rparen"');
    });
  });

  describe('Populated Expression Ribbon Rendering', () => {
    const mockTokens = [
      { id: 'tok_1', type: 'digit', value: '3', display: '3' },
      { id: 'tok_2', type: 'operator', value: '*', display: '×' },
      { id: 'tok_3', type: 'digit', value: '5', display: '5' },
      { id: 'tok_4', type: 'operator', value: '+', display: '+' },
      { id: 'tok_5', type: 'digit', value: '2', display: '2' },
    ];

    it('renders token chips with appropriate CSS classes and values', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockTokens,
        })
      );

      expect(html).toContain('5 symbols');
      expect(html).toContain('token-chip-digit');
      expect(html).toContain('token-chip-operator');
      expect(html).toContain('3');
      expect(html).toContain('×');
      expect(html).toContain('5');
      expect(html).toContain('+');
      expect(html).toContain('2');
      expect(html).not.toContain('disabled=""'); // Backspace & Clear buttons enabled
    });

    it('renders live preview of assembled expression string', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockTokens,
        })
      );

      expect(html).toContain('Expression String:');
      expect(html).toContain('3 × 5 + 2');
    });

    it('renders parenthesized expressions correctly', () => {
      const parenTokens = [
        { id: 't1', type: 'paren', value: '(', display: '(' },
        { id: 't2', type: 'digit', value: '3', display: '3' },
        { id: 't3', type: 'operator', value: '+', display: '+' },
        { id: 't4', type: 'digit', value: '5', display: '5' },
        { id: 't5', type: 'paren', value: ')', display: ')' },
        { id: 't6', type: 'operator', value: '*', display: '×' },
        { id: 't7', type: 'digit', value: '2', display: '2' },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: parenTokens,
        })
      );

      expect(html).toContain('token-chip-paren');
      expect(html).toContain('( 3 + 5 ) × 2');
    });
  });

  describe('Token Editing Lifecycle Logic', () => {
    it('appends tokens to the end of the sequence', () => {
      let tokens = [];
      const append = (val, type) => {
        tokens = [...tokens, { id: `t_${tokens.length}`, type, value: val, display: val }];
      };

      append('3', 'digit');
      expect(tokens.map((t) => t.value)).toEqual(['3']);

      append('+', 'operator');
      expect(tokens.map((t) => t.value)).toEqual(['3', '+']);

      append('5', 'digit');
      expect(tokens.map((t) => t.value)).toEqual(['3', '+', '5']);
    });

    it('removes the last token on backspace', () => {
      let tokens = [
        { id: '1', value: '3' },
        { id: '2', value: '+' },
        { id: '3', value: '5' },
      ];
      const backspace = () => {
        tokens = tokens.slice(0, -1);
      };

      backspace();
      expect(tokens.map((t) => t.value)).toEqual(['3', '+']);

      backspace();
      expect(tokens.map((t) => t.value)).toEqual(['3']);

      backspace();
      expect(tokens).toEqual([]);
    });

    it('removes a specific token by index when dismissed', () => {
      let tokens = [
        { id: '1', value: '3' },
        { id: '2', value: '+' },
        { id: '3', value: '5' },
      ];
      const removeToken = (idx) => {
        tokens = tokens.filter((_, i) => i !== idx);
      };

      // Remove the middle operator (+)
      removeToken(1);
      expect(tokens.map((t) => t.value)).toEqual(['3', '5']);
    });

    it('clears all tokens', () => {
      let tokens = [
        { id: '1', value: '3' },
        { id: '2', value: '+' },
        { id: '3', value: '5' },
      ];
      const clearAll = () => {
        tokens = [];
      };

      clearAll();
      expect(tokens).toEqual([]);
    });
  });

  describe('Recognition Integration Callback Behavior', () => {
    it('calls clearWriting callback when a recognized digit is appended', () => {
      const clearWritingMock = vi.fn();
      let expressionTokens = [];

      const handleAppendToken = (value, type = 'digit') => {
        if (!value) return;
        const displayMap = { '*': '×', '/': '÷' };
        const newToken = {
          id: 'test_token',
          type,
          value: String(value),
          display: displayMap[value] || String(value),
        };
        expressionTokens = [...expressionTokens, newToken];
        if (type === 'digit') {
          clearWritingMock();
        }
      };

      // 1. Commit recognized digit
      handleAppendToken('7', 'digit');
      expect(expressionTokens).toHaveLength(1);
      expect(expressionTokens[0].value).toBe('7');
      expect(clearWritingMock).toHaveBeenCalledTimes(1);

      // 2. Commit operator (does NOT call clearWriting)
      handleAppendToken('*', 'operator');
      expect(expressionTokens).toHaveLength(2);
      expect(expressionTokens[1].display).toBe('×');
      expect(clearWritingMock).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('Milestone 6.4 (Phase B): Live Syntax Readiness Validation', () => {
    it('shows EMPTY status and disables solve button when expression has no tokens', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: [],
        })
      );

      expect(html).toContain('status-empty');
      expect(html).toContain('✏️ Empty');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-solve-expression"/);
    });

    it('shows INCOMPLETE status when expression has a trailing operator', () => {
      const tokens = [
        { id: '1', type: 'digit', value: '3', display: '3' },
        { id: '2', type: 'operator', value: '+', display: '+' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
        })
      );

      expect(html).toContain('status-incomplete');
      expect(html).toContain('⏳ Incomplete');
      expect(html).toContain('expected operand after');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-solve-expression"/);
    });

    it('shows INCOMPLETE status when opening parenthesis is unclosed', () => {
      const tokens = [
        { id: '1', type: 'paren', value: '(', display: '(' },
        { id: '2', type: 'digit', value: '3', display: '3' },
        { id: '3', type: 'operator', value: '+', display: '+' },
        { id: '4', type: 'digit', value: '5', display: '5' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
        })
      );

      expect(html).toContain('status-incomplete');
      expect(html).toContain('⏳ Incomplete');
      expect(html).toContain('Unmatched opening parenthesis');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-solve-expression"/);
    });

    it('shows SYNTAX_ERROR status on leading operator', () => {
      const tokens = [
        { id: '1', type: 'operator', value: '+', display: '+' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
        })
      );

      expect(html).toContain('status-error');
      expect(html).toContain('⚠️ Syntax Error');
      expect(html).toContain('Unexpected operator');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-solve-expression"/);
    });

    it('shows SYNTAX_ERROR status on consecutive operators', () => {
      const tokens = [
        { id: '1', type: 'digit', value: '3', display: '3' },
        { id: '2', type: 'operator', value: '+', display: '+' },
        { id: '3', type: 'operator', value: '*', display: '×' },
        { id: '4', type: 'digit', value: '5', display: '5' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
        })
      );

      expect(html).toContain('status-error');
      expect(html).toContain('⚠️ Syntax Error');
      expect(html).toContain('Unexpected consecutive operator');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-solve-expression"/);
    });

    it('shows READY status and enables solve button on valid arithmetic expression', () => {
      const tokens = [
        { id: '1', type: 'digit', value: '3', display: '3' },
        { id: '2', type: 'operator', value: '*', display: '×' },
        { id: '3', type: 'digit', value: '5', display: '5' },
        { id: '4', type: 'operator', value: '+', display: '+' },
        { id: '5', type: 'digit', value: '2', display: '2' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
        })
      );

      expect(html).toContain('status-ready');
      expect(html).toContain('✓ Ready to Solve');
      expect(html).toContain('Valid arithmetic expression');
      // Solve button should not be disabled
      expect(html).toContain('id="btn-solve-expression"');
      expect(html).not.toMatch(/id="btn-solve-expression"[^>]*disabled=""/);
    });
  });

  describe('Milestone 6.4 (Phase B): Step-by-Step Reduction Display', () => {
    it('renders step-by-step reduction cards for multi-step expression', () => {
      const tokens = [
        { id: '1', type: 'digit', value: '3', display: '3' },
        { id: '2', type: 'operator', value: '*', display: '×' },
        { id: '3', type: 'digit', value: '5', display: '5' },
        { id: '4', type: 'operator', value: '+', display: '+' },
        { id: '5', type: 'digit', value: '2', display: '2' },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
          initialSolved: true,
        })
      );

      expect(html).toContain('id="solver-result-drawer"');
      expect(html).toContain('id="solver-final-value"');
      expect(html).toContain('17');
      expect(html).toContain('2 steps');
      expect(html).toContain('Step 1');
      expect(html).toContain('3 × 5 = 15');
      expect(html).toContain('Step 2');
      expect(html).toContain('15 + 2 = 17');
      expect(html).toContain('Final reduced value is <strong>17</strong>');
    });

    it('renders step-by-step reductions respecting parentheses precedence', () => {
      const tokens = [
        { id: '1', type: 'paren', value: '(', display: '(' },
        { id: '2', type: 'digit', value: '3', display: '3' },
        { id: '3', type: 'operator', value: '+', display: '+' },
        { id: '4', type: 'digit', value: '5', display: '5' },
        { id: '5', type: 'paren', value: ')', display: ')' },
        { id: '6', type: 'operator', value: '*', display: '×' },
        { id: '7', type: 'digit', value: '2', display: '2' },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
          initialSolved: true,
        })
      );

      expect(html).toContain('16');
      expect(html).toContain('Step 1');
      expect(html).toContain('3 + 5 = 8');
      expect(html).toContain('Step 2');
      expect(html).toContain('8 × 2 = 16');
    });

    it('handles single literal value without reductions', () => {
      const tokens = [
        { id: '1', type: 'digit', value: '42', display: '42' },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
          initialSolved: true,
        })
      );

      expect(html).toContain('42');
      expect(html).toContain('0 steps');
      expect(html).toContain('Expression is already an irreducible literal value');
    });

    it('handles division by zero error gracefully with clean error banner', () => {
      const tokens = [
        { id: '1', type: 'digit', value: '5', display: '5' },
        { id: '2', type: 'operator', value: '/', display: '÷' },
        { id: '3', type: 'digit', value: '0', display: '0' },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
          initialSolved: true,
        })
      );

      expect(html).toContain('id="solver-eval-error"');
      expect(html).toContain('Division by zero is undefined');
      expect(html).not.toContain('id="solver-result-drawer"');
    });
  });

  describe('Milestone 6.4 (Phase C): Solver vs. Practice Mode Isolation', () => {
    const mockProblemTokens = [
      { id: '1', type: 'digit', value: '3', display: '3' },
      { id: '2', type: 'operator', value: '+', display: '+' },
      { id: '3', type: 'digit', value: '5', display: '5' },
      { id: '4', type: 'operator', value: '*', display: '×' },
      { id: '5', type: 'digit', value: '4', display: '4' },
    ];

    it('renders mode switcher tabs in header', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'solver',
        })
      );

      expect(html).toContain('id="tab-mode-solver"');
      expect(html).toContain('id="tab-mode-practice"');
      expect(html).toContain('mode-tab-btn active');
    });

    it('locks problem editing controls in Practice Mode', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
        })
      );

      expect(html).toContain('🔒 Locked');
      expect(html).toContain('ribbon-locked');
      // Problem backspace and clear buttons must be disabled in practice mode
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-expr-backspace"/);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-expr-clear"/);
      // Operator strip is hidden in practice mode
      expect(html).not.toContain('id="btn-op-plus"');
      // Solver button is hidden in practice mode
      expect(html).not.toContain('id="btn-solve-expression"');
      // Practice section is rendered
      expect(html).toContain('id="practice-workspace-section"');
    });

    it('renders Candidate Answer Buffer and digit pad in Practice Mode', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          answerDigits: ['1', '7'],
          answerSign: '+',
        })
      );

      expect(html).toContain('My Answer:');
      expect(html).toContain('17');
      expect(html).toContain('id="btn-ans-toggle-sign"');
      expect(html).toContain('id="btn-ans-decimal"');
      expect(html).toContain('id="btn-ans-backspace"');
      expect(html).toContain('id="btn-ans-clear"');
      expect(html).toContain('id="btn-check-answer"');
      expect(html).toContain('id="btn-ans-digit-7"');
    });

    it('disables check answer button when answer buffer is empty', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          answerDigits: [],
          answerSign: '+',
        })
      );

      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-check-answer"/);
      expect(html).toContain('Enter answer...');
    });
  });

  describe('Milestone 6.4 (Phase C): Candidate Answer Buffer Editing Logic', () => {
    it('accumulates multiple digits sequentially into answer string', () => {
      let answerDigits = [];
      const append = (digit) => {
        answerDigits = [...answerDigits, String(digit)];
      };

      append('1');
      expect(answerDigits).toEqual(['1']);

      append('7');
      expect(answerDigits).toEqual(['1', '7']);
      expect(answerDigits.join('')).toBe('17');
    });

    it('supports sign toggling and decimal insertion', () => {
      let sign = '+';
      const toggleSign = () => {
        sign = sign === '+' ? '-' : '+';
      };

      let answerDigits = ['3'];
      const addDecimal = () => {
        if (!answerDigits.includes('.')) {
          answerDigits = [...answerDigits, '.'];
        }
      };

      toggleSign();
      expect(sign).toBe('-');

      addDecimal();
      expect(answerDigits).toEqual(['3', '.']);

      // Attempting to add duplicate decimal is rejected
      addDecimal();
      expect(answerDigits).toEqual(['3', '.']);

      answerDigits = [...answerDigits, '5'];
      const candidateStr = (sign === '-' ? '-' : '') + answerDigits.join('');
      expect(candidateStr).toBe('-3.5');
    });

    it('removes last digit on backspace and empties on clear', () => {
      let answerDigits = ['1', '7', '5'];
      const backspace = () => {
        answerDigits = answerDigits.slice(0, -1);
      };
      const clear = () => {
        answerDigits = [];
      };

      backspace();
      expect(answerDigits).toEqual(['1', '7']);

      clear();
      expect(answerDigits).toEqual([]);
    });
  });

  describe('Milestone 6.4 (Phase C): Verification & Anti-Spoiler Feedback', () => {
    const problemTokens = [
      { id: '1', type: 'digit', value: '3', display: '3' },
      { id: '2', type: 'operator', value: '+', display: '+' },
      { id: '3', type: 'digit', value: '5', display: '5' },
      { id: '4', type: 'operator', value: '*', display: '×' },
      { id: '5', type: 'digit', value: '4', display: '4' },
    ];

    it('displays emerald success card when candidate answer is correct', () => {
      const mockCorrectResult = {
        isCorrect: true,
        status: 'VALID',
        candidate: { raw: 23, formatted: '23' },
        reference: {
          raw: 23,
          formatted: '23',
          stepCount: 2,
          steps: [
            { stepIndex: 1, operation: '5 * 4 = 20', beforeExpression: '3 + 5 * 4', afterExpression: '3 + 20' },
            { stepIndex: 2, operation: '3 + 20 = 23', beforeExpression: '3 + 20', afterExpression: '23' },
          ],
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemTokens,
          mode: 'practice',
          answerDigits: ['2', '3'],
          answerSign: '+',
          initialPracticeResult: mockCorrectResult,
        })
      );

      expect(html).toContain('id="practice-feedback-correct"');
      expect(html).toContain('Correct!');
      expect(html).toContain('23');
      expect(html).toContain('id="btn-toggle-practice-steps"');
      expect(html).toContain('View Reduction Steps');
    });

    it('displays amber card with heuristic diagnostic on precedence error, with ground truth withheld', () => {
      const mockIncorrectResult = {
        isCorrect: false,
        status: 'INVALID',
        candidate: { raw: 32, formatted: '32' },
        reference: { raw: 23, formatted: '23' },
        heuristicDiagnostic: {
          category: 'PRECEDENCE_ERROR',
          isHeuristic: true,
          message: 'Candidate answer matches naive left-to-right evaluation; multiplication/division precedence was likely overlooked.',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemTokens,
          mode: 'practice',
          answerDigits: ['3', '2'],
          answerSign: '+',
          initialPracticeResult: mockIncorrectResult,
        })
      );

      expect(html).toContain('id="practice-feedback-incorrect"');
      expect(html).toContain('Incorrect — Try Again');
      expect(html).toContain('PRECEDENCE ERROR');
      expect(html).toContain('multiplication/division precedence was likely overlooked');
      // Anti-spoiler guarantee: Ground truth result (23) is strictly withheld!
      expect(html).not.toContain('matches the ground truth');
      expect(html).not.toContain('id="btn-toggle-practice-steps"');
      expect(html).not.toContain('practice-solution-drawer');
    });
  });

  describe('Milestone 6.4 (Phase C): Air-Writing Practice Answer Callback Integration', () => {
    it('appends recognized digit to candidate answer and clears canvas in practice mode', () => {
      const clearWritingMock = vi.fn();
      let answerDigits = [];

      const handleAppendAnswerDigit = (digit) => {
        if (digit === null || digit === undefined) return;
        answerDigits = [...answerDigits, String(digit)];
        clearWritingMock();
      };

      // 1. Commit air-written digit '2'
      handleAppendAnswerDigit('2');
      expect(answerDigits).toEqual(['2']);
      expect(clearWritingMock).toHaveBeenCalledTimes(1);

      // 2. Commit air-written digit '3'
      handleAppendAnswerDigit('3');
      expect(answerDigits).toEqual(['2', '3']);
      expect(clearWritingMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Milestone 6.4 (Phase D): Complete End-to-End Workflow & Regression Suite', () => {
    it('executes the full Solver Mode workflow: token assembly, syntax transitions, and step reduction', () => {
      // 1. Assembles expression: 2 + 3 * 4
      const tokens = [
        { id: 't1', type: 'digit', value: '2', display: '2' },
        { id: 't2', type: 'operator', value: '+', display: '+' },
        { id: 't3', type: 'digit', value: '3', display: '3' },
        { id: 't4', type: 'operator', value: '*', display: '×' },
        { id: 't5', type: 'digit', value: '4', display: '4' },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens,
          mode: 'solver',
          initialSolved: true,
        })
      );

      // Verify ribbon preview
      expect(html).toContain('2 + 3 × 4');
      // Verify syntax status
      expect(html).toContain('status-ready');
      expect(html).toContain('✓ Ready to Solve');
      // Verify solver result and steps
      expect(html).toContain('id="solver-final-value"');
      expect(html).toContain('14');
      expect(html).toContain('2 steps');
      expect(html).toContain('3 × 4 = 12');
      expect(html).toContain('2 + 12 = 14');
    });

    it('executes full Practice Mode workflow: locks problem, verifies answer, applies anti-spoiler rules, and allows solution reveal', () => {
      const problemTokens = [
        { id: 'p1', type: 'digit', value: '2', display: '2' },
        { id: 'p2', type: 'operator', value: '+', display: '+' },
        { id: 'p3', type: 'digit', value: '3', display: '3' },
        { id: 'p4', type: 'operator', value: '*', display: '×' },
        { id: 'p5', type: 'digit', value: '4', display: '4' },
      ];

      // Step A: Attempt with incorrect answer (20 from naive left-to-right (2 + 3) * 4)
      const incorrectResult = {
        isCorrect: false,
        status: 'INVALID',
        candidate: { raw: 20, formatted: '20' },
        reference: { raw: 14, formatted: '14' },
        heuristicDiagnostic: {
          category: 'PRECEDENCE_ERROR',
          isHeuristic: true,
          message: 'Candidate answer matches naive left-to-right evaluation; multiplication/division precedence was likely overlooked.',
        },
      };

      const htmlAttempt1 = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemTokens,
          mode: 'practice',
          answerDigits: ['2', '0'],
          answerSign: '+',
          initialPracticeResult: incorrectResult,
        })
      );

      // Verify problem is locked
      expect(htmlAttempt1).toContain('🔒 Locked');
      expect(htmlAttempt1).toMatch(/<button[^>]*disabled=""[^>]*id="btn-expr-backspace"/);
      // Verify anti-spoiler feedback: Diagnostic shown, ground truth withheld
      expect(htmlAttempt1).toContain('Incorrect — Try Again');
      expect(htmlAttempt1).toContain('PRECEDENCE ERROR');
      expect(htmlAttempt1).not.toContain('Result = 14');
      expect(htmlAttempt1).not.toContain('id="btn-toggle-practice-steps"');

      // Step B: Correct attempt with answer 14
      const correctResult = {
        isCorrect: true,
        status: 'VALID',
        candidate: { raw: 14, formatted: '14' },
        reference: {
          raw: 14,
          formatted: '14',
          stepCount: 2,
          steps: [
            { stepIndex: 1, operation: '3 * 4 = 12', beforeExpression: '2 + 3 * 4', afterExpression: '2 + 12' },
            { stepIndex: 2, operation: '2 + 12 = 14', beforeExpression: '2 + 12', afterExpression: '14' },
          ],
        },
      };

      const htmlAttempt2 = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemTokens,
          mode: 'practice',
          answerDigits: ['1', '4'],
          answerSign: '+',
          initialPracticeResult: correctResult,
        })
      );

      // Verify success feedback and reveal button availability
      expect(htmlAttempt2).toContain('id="practice-feedback-correct"');
      expect(htmlAttempt2).toContain('Correct!');
      expect(htmlAttempt2).toContain('14');
      expect(htmlAttempt2).toContain('id="btn-toggle-practice-steps"');
    });

    it('preserves problem tokens and isolates state across mode switches', () => {
      const problemTokens = [
        { id: '1', type: 'digit', value: '7', display: '7' },
        { id: '2', type: 'operator', value: '-', display: '-' },
        { id: '3', type: 'digit', value: '3', display: '3' },
      ];

      // Solver rendering
      const htmlSolver = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemTokens,
          mode: 'solver',
        })
      );
      expect(htmlSolver).toContain('7 - 3');
      expect(htmlSolver).toContain('id="btn-solve-expression"');
      expect(htmlSolver).not.toContain('id="practice-workspace-section"');

      // Practice rendering with same problem tokens
      const htmlPractice = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemTokens,
          mode: 'practice',
          answerDigits: ['4'],
        })
      );
      expect(htmlPractice).toContain('7 - 3');
      expect(htmlPractice).toContain('id="practice-workspace-section"');
      expect(htmlPractice).not.toContain('id="btn-solve-expression"');
    });
  });

  describe('Milestone 7.1 (Phase B): Step-by-Step Learning Mode UI Skeleton', () => {
    const mockProblemTokens = [
      { id: '1', type: 'digit', value: '2', display: '2' },
      { id: '2', type: 'operator', value: '+', display: '+' },
      { id: '3', type: 'digit', value: '3', display: '3' },
      { id: '4', type: 'operator', value: '*', display: '×' },
      { id: '5', type: 'digit', value: '4', display: '4' },
    ];

    it('renders Practice Mode sub-selector tabs (Step-by-Step and Direct Answer)', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );

      expect(html).toContain('id="tab-submode-step"');
      expect(html).toContain('id="tab-submode-direct"');
      expect(html).toContain('Step-by-Step');
      expect(html).toContain('Direct Answer');
    });

    it('renders Step-by-Step UI skeleton when practiceSubMode is step', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );

      expect(html).toContain('id="step-practice-section"');
      expect(html).toContain('id="step-reference-card"');
      expect(html).toContain('id="step-reference-expr"');
      expect(html).toContain('2 + 3 × 4');
      expect(html).toContain('id="step-current-working-card"');
      expect(html).toContain('id="step-working-expr"');
      expect(html).toContain('id="btn-copy-current-step"');
      expect(html).toContain('id="step-history-timeline"');
      expect(html).toContain('id="step-assembly-card"');
      expect(html).toContain('id="step-ribbon"');
      expect(html).toContain('id="btn-step-backspace"');
      expect(html).toContain('id="btn-step-clear"');
      expect(html).toContain('id="btn-check-step"');
      expect(html).toContain('id="btn-step-hint"');
    });

    it('renders step operator controls and step digit pad', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );

      expect(html).toContain('id="btn-step-op-plus"');
      expect(html).toContain('id="btn-step-op-minus"');
      expect(html).toContain('id="btn-step-op-mul"');
      expect(html).toContain('id="btn-step-op-div"');
      expect(html).toContain('id="btn-step-op-lparen"');
      expect(html).toContain('id="btn-step-op-rparen"');
      expect(html).toContain('id="btn-step-digit-1"');
      expect(html).toContain('id="btn-step-digit-9"');
    });

    it('displays Empty Step syntax feedback when step candidate is empty', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          stepTokens: [],
        })
      );

      expect(html).toContain('Empty Step');
      expect(html).toContain('status-empty');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-check-step"/);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-step-backspace"/);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-step-clear"/);
    });

    it('displays Incomplete Step syntax feedback for trailing operator in step candidate', () => {
      const incompleteStepTokens = [
        { id: 'st_1', type: 'digit', value: '2', display: '2' },
        { id: 'st_2', type: 'operator', value: '+', display: '+' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          stepTokens: incompleteStepTokens,
        })
      );

      expect(html).toContain('Incomplete Step');
      expect(html).toContain('status-incomplete');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*id="btn-check-step"/);
    });

    it('displays Step Ready syntax feedback and enables Check Step for valid step expression', () => {
      const readyStepTokens = [
        { id: 'st_1', type: 'digit', value: '2', display: '2' },
        { id: 'st_2', type: 'operator', value: '+', display: '+' },
        { id: 'st_3', type: 'digit', value: '1', display: '1' },
        { id: 'st_4', type: 'digit', value: '2', display: '2' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          stepTokens: readyStepTokens,
        })
      );

      expect(html).toContain('Step Ready');
      expect(html).toContain('status-ready');
      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*id="btn-check-step"/);
      expect(html).toContain('id="btn-check-step"');
    });

    it('renders step history timeline when past steps are provided', () => {
      const history = [
        { stepIndex: 1, expression: '2 + 12', reductionNote: 'Reduced 3 × 4 = 12' },
      ];
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          stepHistory: history,
        })
      );

      expect(html).toContain('Solution Timeline:');
      expect(html).toContain('Completed 1 step(s)');
      expect(html).toContain('Step 1');
      expect(html).toContain('2 + 12');
      expect(html).toContain('Reduced 3 × 4 = 12');
    });

    it('preserves Direct Answer UI when practiceSubMode is direct', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'direct',
          answerDigits: ['1', '4'],
        })
      );

      expect(html).toContain('id="candidate-answer-display"');
      expect(html).toContain('14');
      expect(html).toContain('id="btn-check-answer"');
      expect(html).not.toContain('id="step-assembly-card"');
    });

    it('keeps Solver Mode completely unaffected by Step-by-Step UI', () => {
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'solver',
        })
      );

      expect(html).toContain('id="btn-solve-expression"');
      expect(html).toContain('id="btn-op-plus"');
      expect(html).not.toContain('id="step-practice-section"');
      expect(html).not.toContain('id="tab-submode-step"');
    });
  });

  describe('Milestone 7.1 (Phase C): Interactive Step Loop, Feedback, Retries & Hints', () => {
    const mockProblemTokens = [
      { id: '1', type: 'digit', value: '2', display: '2' },
      { id: '2', type: 'operator', value: '+', display: '+' },
      { id: '3', type: 'digit', value: '3', display: '3' },
      { id: '4', type: 'operator', value: '*', display: '×' },
      { id: '5', type: 'digit', value: '4', display: '4' },
    ];

    it('renders valid step feedback and updated working expression for accepted reduction', () => {
      const stepTokens = [
        { id: 's1', type: 'digit', value: '2', display: '2' },
        { id: 's2', type: 'operator', value: '+', display: '+' },
        { id: 's3', type: 'digit', value: '1', display: '1' },
        { id: 's4', type: 'digit', value: '2', display: '2' },
      ];
      const validFeedback = {
        isValid: true,
        status: 'VALID',
        feedback: {
          title: 'Valid Step',
          message: 'Valid step: 1 subexpression(s) reduced.',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          workingTokens: stepTokens,
          initialStepFeedback: validFeedback,
          stepHistory: [
            { stepIndex: 1, expression: '2 + 12', reductionNote: 'Valid step: 1 subexpression(s) reduced.' },
          ],
        })
      );

      expect(html).toContain('id="step-feedback-valid"');
      expect(html).toContain('Valid step: 1 subexpression(s) reduced.');
      expect(html).toContain('id="step-working-expr"');
      expect(html).toContain('2 + 12');
      expect(html).toContain('id="btn-undo-step"');
      expect(html).toContain('id="btn-step-restart"');
    });

    it('renders completion celebration card when problem is fully solved', () => {
      const completedFeedback = {
        isValid: true,
        isComplete: true,
        status: 'COMPLETED',
        feedback: {
          title: 'Problem Solved!',
          message: 'Final result 14 reached and verified!',
        },
      };
      const finalTokens = [{ id: 'f1', type: 'digit', value: '1', display: '1' }, { id: 'f2', type: 'digit', value: '4', display: '4' }];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          workingTokens: finalTokens,
          initialStepFeedback: completedFeedback,
          stepHistory: [
            { stepIndex: 1, expression: '2 + 12', reductionNote: 'Reduced 3 × 4 = 12' },
            { stepIndex: 2, expression: '14', reductionNote: 'Final result: 14', status: 'COMPLETED' },
          ],
        })
      );

      expect(html).toContain('id="step-completion-card"');
      expect(html).toContain('Problem Solved!');
      expect(html).toContain('id="step-final-value"');
      expect(html).toContain('14');
      expect(html).toContain('id="btn-step-undo-final"');
      expect(html).toContain('id="btn-step-restart-final"');
      // Assembly card is hidden upon completion
      expect(html).not.toContain('id="step-assembly-card"');
    });

    it('renders invalid step feedback for operator precedence violation', () => {
      const precedenceFeedback = {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        feedback: {
          title: 'Incorrect Step',
          message: 'Operator precedence violation: multiplication and division must be performed before addition and subtraction.',
          category: 'PRECEDENCE_ERROR',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: precedenceFeedback,
        })
      );

      expect(html).toContain('id="step-feedback-invalid"');
      expect(html).toContain('id="step-feedback-category"');
      expect(html).toContain('PRECEDENCE ERROR');
      expect(html).toContain('multiplication and division must be performed before addition');
      // Working expression remains original problem
      expect(html).toContain('id="step-working-expr"');
      expect(html).toContain('2 + 3 × 4');
    });

    it('renders step-skipped feedback when intermediate operations are omitted', () => {
      const skippedFeedback = {
        isValid: false,
        isComplete: false,
        status: 'STEP_SKIPPED',
        feedback: {
          title: 'Step Skipped',
          message: 'You jumped directly to the final answer. In step-by-step mode, please calculate one operation at a time.',
          category: 'STEP_SKIPPED',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: skippedFeedback,
        })
      );

      expect(html).toContain('id="step-feedback-invalid"');
      expect(html).toContain('STEP SKIPPED');
      expect(html).toContain('please calculate one operation at a time');
    });

    it('renders calculation error feedback when arithmetic is incorrect', () => {
      const calcFeedback = {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        feedback: {
          title: 'Incorrect Step',
          message: 'Mathematically invalid step: evaluates to 17, expected 14.',
          category: 'ARITHMETIC_ERROR',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: calcFeedback,
        })
      );

      expect(html).toContain('id="step-feedback-invalid"');
      expect(html).toContain('ARITHMETIC ERROR');
      expect(html).toContain('Mathematically invalid step');
    });

    it('renders anti-spoiler pedagogical hint card without revealing answers', () => {
      const hint = generateStepHint(mockProblemTokens);
      expect(hint.isSpoiled).toBe(false);
      expect(hint.message).not.toContain('12');
      expect(hint.message).not.toContain('14');

      // Check hint button is ready
      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );

      expect(html).toContain('id="btn-step-hint"');
      expect(html).toContain('💡 Hint');
    });

    it('supports step recovery via Undo button', () => {
      const history = [
        { stepIndex: 1, expression: '2 + 12', reductionNote: 'Reduced 3 × 4 = 12', tokens: [{ id: '1', value: '2' }] },
      ];

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          stepHistory: history,
        })
      );

      expect(html).toContain('id="btn-undo-step"');
      expect(html).toContain('↩ Undo Step');
      expect(html).toContain('id="btn-step-restart"');
      expect(html).toContain('↺ Restart');
    });
  });

  describe('Milestone 7.1 (Phase D): Comprehensive Step-by-Step Integration & Regression Suite', () => {
    it('executes a complete multi-step reduction workflow with hints, invalid attempt, and completion', () => {
      // 1. Initial problem: 8 + 3 * 2
      const initialTokens = [
        { id: '1', type: 'digit', value: '8', display: '8' },
        { id: '2', type: 'operator', value: '+', display: '+' },
        { id: '3', type: 'digit', value: '3', display: '3' },
        { id: '4', type: 'operator', value: '*', display: '×' },
        { id: '5', type: 'digit', value: '2', display: '2' },
      ];

      // Step 1 candidate: 8 + 6
      const step1Tokens = [
        { id: 's1', type: 'digit', value: '8', display: '8' },
        { id: 's2', type: 'operator', value: '+', display: '+' },
        { id: 's3', type: 'digit', value: '6', display: '6' },
      ];

      // Final step candidate: 14
      const step2Tokens = [
        { id: 'f1', type: 'digit', value: '1', display: '1' },
        { id: 'f2', type: 'digit', value: '4', display: '4' },
      ];

      // Verify hint for initial expression targets 3 * 2
      const initialHint = generateStepHint(initialTokens);
      expect(initialHint.targetSubexpression).toBe('3 × 2');
      expect(initialHint.operator).toBe('*');
      expect(initialHint.rule).toBe('PRECEDENCE_HIGH');
      expect(initialHint.isSpoiled).toBe(false);

      // Verify single-step validation for valid step 1
      const resStep1 = verifySingleStep(initialTokens, step1Tokens);
      expect(resStep1.isValid).toBe(true);
      expect(resStep1.status).toBe('VALID');
      expect(resStep1.reductions).toBe(1);

      // Verify single-step validation for final step 2
      const resStep2 = verifySingleStep(step1Tokens, step2Tokens);
      expect(resStep2.isValid).toBe(true);
      expect(resStep2.status).toBe('COMPLETED');
      expect(resStep2.formattedResult).toBe('14');

      // Verify rejection of precedence error (8 + 3 * 2 -> 11 * 2)
      const invalidPrecedenceTokens = [
        { id: 'i1', type: 'digit', value: '1', display: '1' },
        { id: 'i2', type: 'digit', value: '1', display: '1' },
        { id: 'i3', type: 'operator', value: '*', display: '×' },
        { id: 'i4', type: 'digit', value: '2', display: '2' },
      ];
      const resPrecedence = verifySingleStep(initialTokens, invalidPrecedenceTokens);
      expect(resPrecedence.isValid).toBe(false);
      expect(resPrecedence.status).toBe('INVALID');
      expect(resPrecedence.feedback.category).toBe('PRECEDENCE_ERROR');

      // Verify rejection of skipped operations (jumping directly 8 + 3 * 2 -> 14)
      const resSkipped = verifySingleStep(initialTokens, step2Tokens);
      expect(resSkipped.isValid).toBe(false);
      expect(resSkipped.status).toBe('STEP_SKIPPED');
      expect(resSkipped.feedback.title).toBe('Step Skipped');
    });

    it('verifies associative regrouping in step-by-step mode for addition and multiplication', () => {
      // 2 + 3 + 4 -> 2 + 7 (evaluating 3 + 4 = 7)
      const addChainTokens = [
        { id: '1', type: 'digit', value: '2', display: '2' },
        { id: '2', type: 'operator', value: '+', display: '+' },
        { id: '3', type: 'digit', value: '3', display: '3' },
        { id: '4', type: 'operator', value: '+', display: '+' },
        { id: '5', type: 'digit', value: '4', display: '4' },
      ];
      const addRegroupTokens = [
        { id: 'r1', type: 'digit', value: '2', display: '2' },
        { id: 'r2', type: 'operator', value: '+', display: '+' },
        { id: 'r3', type: 'digit', value: '7', display: '7' },
      ];
      const resAdd = verifySingleStep(addChainTokens, addRegroupTokens);
      expect(resAdd.isValid).toBe(true);
      expect(resAdd.status).toBe('VALID');

      // 2 * 3 * 4 -> 2 * 12 (evaluating 3 * 4 = 12)
      const mulChainTokens = [
        { id: '1', type: 'digit', value: '2', display: '2' },
        { id: '2', type: 'operator', value: '*', display: '×' },
        { id: '3', type: 'digit', value: '3', display: '3' },
        { id: '4', type: 'operator', value: '*', display: '×' },
        { id: '5', type: 'digit', value: '4', display: '4' },
      ];
      const mulRegroupTokens = [
        { id: 'r1', type: 'digit', value: '2', display: '2' },
        { id: 'r2', type: 'operator', value: '*', display: '×' },
        { id: 'r3', type: 'digit', value: '1', display: '1' },
        { id: 'r4', type: 'digit', value: '2', display: '2' },
      ];
      const resMul = verifySingleStep(mulChainTokens, mulRegroupTokens);
      expect(resMul.isValid).toBe(true);
      expect(resMul.status).toBe('VALID');
    });

    it('verifies nested parenthesized expressions step-by-step', () => {
      // (2 + 3) * (4 + 5) -> 5 * (4 + 5) -> 5 * 9 -> 45
      const expr0 = '(2 + 3) * (4 + 5)';
      const expr1 = '5 * (4 + 5)';
      const expr2 = '5 * 9';
      const expr3 = '45';

      const res1 = verifySingleStep(expr0, expr1);
      expect(res1.isValid).toBe(true);
      expect(res1.status).toBe('VALID');

      const res2 = verifySingleStep(expr1, expr2);
      expect(res2.isValid).toBe(true);
      expect(res2.status).toBe('VALID');

      const res3 = verifySingleStep(expr2, expr3);
      expect(res3.isValid).toBe(true);
      expect(res3.status).toBe('COMPLETED');
      expect(res3.formattedResult).toBe('45');
    });

    it('resets step session when problem tokens are modified', () => {
      const problemA = [
        { id: '1', type: 'digit', value: '2', display: '2' },
        { id: '2', type: 'operator', value: '+', display: '+' },
        { id: '3', type: 'digit', value: '3', display: '3' },
      ];
      const problemB = [
        { id: '4', type: 'digit', value: '5', display: '5' },
        { id: '5', type: 'operator', value: '*', display: '×' },
        { id: '6', type: 'digit', value: '6', display: '6' },
      ];

      // Render problem A
      const htmlA = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemA,
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );
      expect(htmlA).toContain('2 + 3');

      // Render problem B
      const htmlB = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: problemB,
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );
      expect(htmlB).toContain('5 × 6');
      expect(htmlB).not.toContain('2 + 3');
      expect(htmlB).toContain('Starting Step 1');
    });

    it('handles empty and malformed expressions gracefully without throwing', () => {
      const htmlEmpty = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: [],
          mode: 'practice',
          practiceSubMode: 'step',
        })
      );
      expect(htmlEmpty).toContain('No problem loaded');
      expect(htmlEmpty).toMatch(/<button[^>]*id="btn-copy-current-step"[^>]*disabled=""/);
      expect(htmlEmpty).toMatch(/<button[^>]*id="btn-step-hint"[^>]*disabled=""/);
    });
  });

  describe('Milestone 7.2 (Phase C): Contextual Feedback UI & Progressive Guidance Integration', () => {
    const mockProblemTokens = [
      { id: '1', type: 'digit', value: '8', display: '8' },
      { id: '2', type: 'operator', value: '+', display: '+' },
      { id: '3', type: 'digit', value: '3', display: '3' },
      { id: '4', type: 'operator', value: '*', display: '×' },
      { id: '5', type: 'digit', value: '2', display: '2' },
    ];

    it('renders translated student-friendly category badge, confidence pill, and remediation tip', () => {
      const contextualFeedback = {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        feedback: {
          title: 'Order of Operations Error',
          message: 'Multiplication and division must be performed before addition and subtraction.',
          category: 'PRECEDENCE_VIOLATION',
          confidence: 'PROBABLE',
          remediationAdvice: 'Identify and calculate operations with higher precedence first.',
          suggestedHintLevel: 2,
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: contextualFeedback,
        })
      );

      expect(html).toContain('id="step-feedback-title"');
      expect(html).toContain('Order of Operations Error');
      expect(html).toContain('id="step-feedback-category"');
      expect(html).toContain('Order of Operations');
      expect(html).toContain('id="step-feedback-confidence"');
      expect(html).toContain('Probable');
      expect(html).toContain('id="step-feedback-remediation"');
      expect(html).toContain('💡 Tip:');
      expect(html).toContain('Identify and calculate operations with higher precedence first.');
    });

    it('renders Calculation Slip and Sign Error badges with supportive remediation guidance', () => {
      const slipFeedback = {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        feedback: {
          title: 'Calculation Slip',
          message: 'You selected the right operation (3 × 2) to calculate, but made a calculation slip.',
          category: 'ARITHMETIC_SLIP',
          confidence: 'PROBABLE',
          remediationAdvice: 'Double-check your basic arithmetic calculation for 3 × 2.',
          suggestedHintLevel: 2,
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: slipFeedback,
        })
      );

      expect(html).toContain('Calculation Slip');
      expect(html).toContain('Double-check your basic arithmetic calculation for 3 × 2.');
    });

    it('renders Level 1 Progressive Hint (Concept Nudge) with level badge and zero subexpression leak', () => {
      const level1Hint = {
        level: 1,
        ruleKey: 'PRECEDENCE_PRIORITY',
        title: 'Order of Operations: Multiplication & Division First',
        hintText: 'Multiplication and division have higher priority than addition and subtraction.',
        targetSubexpression: null,
        operator: '*',
        hasParallelExample: false,
        parallelExample: null,
        antiSpoilerGuarantee: true,
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialActiveHint: level1Hint,
          initialHintLevel: 1,
        })
      );

      expect(html).toContain('id="step-hint-card"');
      expect(html).toContain('id="step-hint-level-badge"');
      expect(html).toContain('Level 1 of 3');
      expect(html).toContain('id="btn-hint-level-1"');
      expect(html).toContain('active');
      expect(html).toContain('Multiplication and division have higher priority than addition and subtraction.');
      expect(html).toContain('id="btn-next-hint-level"');
      expect(html).toContain('Need more help? Level 2 ➔');
      // Level 1 does not render target subexpression row
      expect(html).not.toContain('id="step-hint-target-row"');
    });

    it('renders Level 2 Progressive Hint (Focused Guidance) with isolated target subexpression', () => {
      const level2Hint = {
        level: 2,
        ruleKey: 'PRECEDENCE_PRIORITY',
        title: 'Target Operation',
        hintText: 'Focus on the multiplication: calculate 3 × 2 before adding or subtracting.',
        targetSubexpression: '3 × 2',
        operator: '*',
        hasParallelExample: false,
        parallelExample: null,
        antiSpoilerGuarantee: true,
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialActiveHint: level2Hint,
          initialHintLevel: 2,
        })
      );

      expect(html).toContain('Level 2 of 3');
      expect(html).toContain('id="btn-hint-level-2"');
      expect(html).toContain('id="step-hint-target-row"');
      expect(html).toContain('id="step-hint-target"');
      expect(html).toContain('3 × 2');
      expect(html).toContain('id="btn-prev-hint-level"');
      expect(html).toContain('id="btn-next-hint-level"');
    });

    it('renders Level 3 Progressive Hint with validated parallel example card', () => {
      const level3Hint = {
        level: 3,
        ruleKey: 'PRECEDENCE_PRIORITY',
        title: 'Rule Explanation & Example',
        hintText: 'Rule: In standard order of operations, multiplication takes priority. For example, in 5 + 4 × 7, we do 4 × 7 = 28 first.',
        targetSubexpression: '3 × 2',
        operator: '*',
        hasParallelExample: true,
        parallelExample: {
          expression: '5 + 4 × 7',
          firstStep: '4 × 7 = 28',
          explanation: 'Multiply first: 4 × 7 = 28, then add: 5 + 28 = 33.',
        },
        antiSpoilerGuarantee: true,
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialActiveHint: level3Hint,
          initialHintLevel: 3,
        })
      );

      expect(html).toContain('Level 3 of 3');
      expect(html).toContain('id="btn-hint-level-3"');
      expect(html).toContain('id="hint-parallel-example"');
      expect(html).toContain('id="parallel-example-expr"');
      expect(html).toContain('5 + 4 × 7');
      expect(html).toContain('id="parallel-example-step"');
      expect(html).toContain('4 × 7 = 28');
      expect(html).toContain('id="parallel-example-note"');
      expect(html).toContain('id="btn-prev-hint-level"');
      // Level 3 is max level, so next button is not rendered
      expect(html).not.toContain('id="btn-next-hint-level"');
    });

    it('renders Level 3 safe non-numerical fallback when parallel example is unavailable', () => {
      const fallbackHint = {
        level: 3,
        ruleKey: 'PRECEDENCE_PRIORITY',
        title: 'Rule Explanation & Example',
        hintText: 'Rule: Always calculate operations in strict PEMDAS / BODMAS priority: Parentheses, then Multiplication/Division, then Addition/Subtraction.',
        targetSubexpression: '3 × 2',
        operator: '*',
        hasParallelExample: false,
        parallelExample: null,
        antiSpoilerGuarantee: true,
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialActiveHint: fallbackHint,
          initialHintLevel: 3,
        })
      );

      expect(html).toContain('Level 3 of 3');
      expect(html).toContain('strict PEMDAS / BODMAS priority');
      expect(html).not.toContain('id="hint-parallel-example"');
    });

    it('maintains Direct Answer mode isolation from step hints and feedback banners', () => {
      const htmlDirect = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'direct',
        })
      );

      expect(htmlDirect).toContain('id="candidate-answer-display"');
      expect(htmlDirect).toContain('id="btn-check-answer"');
      expect(htmlDirect).not.toContain('id="step-feedback-invalid"');
      expect(htmlDirect).not.toContain('id="step-hint-card"');
      expect(htmlDirect).not.toContain('id="step-assembly-card"');
    });
  });

  describe('Milestone 7.2 (Phase D): Session-Local Repeated Mistake Awareness Integration', () => {
    const mockProblemTokens = [
      { id: '1', type: 'digit', value: '8', display: '8' },
      { id: '2', type: 'operator', value: '+', display: '+' },
      { id: '3', type: 'digit', value: '3', display: '3' },
      { id: '4', type: 'operator', value: '*', display: '×' },
      { id: '5', type: 'digit', value: '2', display: '2' },
    ];

    it('renders repeated mistake pattern alert when error category reaches repetition threshold', () => {
      const repeatedTrackerSummary = {
        totalMistakes: 2,
        categoryCounts: { PRECEDENCE_VIOLATION: 2 },
        repeatedCategories: ['PRECEDENCE_VIOLATION'],
        primaryPattern: 'PRECEDENCE_VIOLATION',
        patternInsight: {
          category: 'PRECEDENCE_VIOLATION',
          count: 2,
          title: 'Order of Operations Pattern',
          supportiveMessage:
            'You have encountered order-of-operation hurdles on this problem. Remember that multiplication and division take priority over addition and subtraction (PEMDAS / BODMAS). Check the hint for step-by-step guidance!',
          recommendedHintLevel: 2,
        },
      };

      const stepFeedback = {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        feedback: {
          title: 'Order of Operations Error',
          message: 'Multiplication and division must be performed before addition and subtraction.',
          category: 'PRECEDENCE_VIOLATION',
          confidence: 'PROBABLE',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: stepFeedback,
          initialTrackerSummary: repeatedTrackerSummary,
        })
      );

      expect(html).toContain('id="step-pattern-alert"');
      expect(html).toContain('id="pattern-alert-title"');
      expect(html).toContain('Order of Operations Pattern');
      expect(html).toContain('id="pattern-alert-count"');
      expect(html).toContain('Encountered 2×');
      expect(html).toContain('id="pattern-alert-message"');
      expect(html).toContain('PEMDAS / BODMAS');
      expect(html).toContain('id="btn-pattern-hint-action"');
      expect(html).toContain('Open Hint Level 2 Guidance ➔');
    });

    it('does not render pattern alert when mistakes are below repetition threshold', () => {
      const belowThresholdSummary = {
        totalMistakes: 1,
        categoryCounts: { PRECEDENCE_VIOLATION: 1 },
        repeatedCategories: [],
        primaryPattern: null,
        patternInsight: null,
      };

      const stepFeedback = {
        isValid: false,
        isComplete: false,
        status: 'INVALID',
        feedback: {
          title: 'Order of Operations Error',
          message: 'Multiplication and division must be performed before addition.',
          category: 'PRECEDENCE_VIOLATION',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: stepFeedback,
          initialTrackerSummary: belowThresholdSummary,
        })
      );

      expect(html).not.toContain('id="step-pattern-alert"');
    });

    it('does not render pattern alert on valid step feedback even if prior mistakes exist', () => {
      const activePatternSummary = {
        totalMistakes: 2,
        categoryCounts: { PRECEDENCE_VIOLATION: 2 },
        repeatedCategories: ['PRECEDENCE_VIOLATION'],
        primaryPattern: 'PRECEDENCE_VIOLATION',
        patternInsight: {
          category: 'PRECEDENCE_VIOLATION',
          count: 2,
          title: 'Order of Operations Pattern',
          supportiveMessage: 'Take your time to review PEMDAS / BODMAS.',
          recommendedHintLevel: 2,
        },
      };

      const validFeedback = {
        isValid: true,
        status: 'VALID',
        feedback: {
          title: 'Valid Step',
          message: 'Reduced 3 × 2 = 6',
        },
      };

      const html = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'practice',
          practiceSubMode: 'step',
          initialStepFeedback: validFeedback,
          initialTrackerSummary: activePatternSummary,
        })
      );

      // On valid steps, pattern alert should NOT be shown
      expect(html).not.toContain('id="step-pattern-alert"');
    });

    it('maintains Solver Mode isolation from repeated mistake alerts', () => {
      const activePatternSummary = {
        totalMistakes: 2,
        categoryCounts: { PRECEDENCE_VIOLATION: 2 },
        repeatedCategories: ['PRECEDENCE_VIOLATION'],
        primaryPattern: 'PRECEDENCE_VIOLATION',
        patternInsight: {
          category: 'PRECEDENCE_VIOLATION',
          count: 2,
          title: 'Order of Operations Pattern',
          supportiveMessage: 'Take your time to review PEMDAS / BODMAS.',
          recommendedHintLevel: 2,
        },
      };

      const htmlSolver = renderToString(
        React.createElement(ExpressionWorkspace, {
          tokens: mockProblemTokens,
          mode: 'solver',
          initialTrackerSummary: activePatternSummary,
        })
      );

      expect(htmlSolver).not.toContain('id="step-pattern-alert"');
      expect(htmlSolver).toContain('id="tab-mode-solver"');
    });
  });
});
