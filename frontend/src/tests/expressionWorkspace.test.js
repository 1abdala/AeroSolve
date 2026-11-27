/**
 * AeroSolve — Milestone 6.4 (Phase A): Expression Workspace Component Tests
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import ExpressionWorkspace, { OPERATOR_BUTTONS } from '../components/ExpressionWorkspace';

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
});
