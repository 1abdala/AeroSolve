import React, { useState, useMemo, useCallback } from 'react';
import { parseExpression, ParseError } from '../services/expressionParser.js';
import { evaluateExpression, EvaluationError } from '../services/expressionEvaluator.js';
import { verifyAnswer } from '../services/solutionVerifier.js';

/**
 * Standard arithmetic operators and grouping delimiters supported by the workspace.
 */
export const OPERATOR_BUTTONS = [
  { label: '+', value: '+', type: 'operator', title: 'Add (+)' },
  { label: '-', value: '-', type: 'operator', title: 'Subtract (-)' },
  { label: '×', value: '*', type: 'operator', title: 'Multiply (×)' },
  { label: '÷', value: '/', type: 'operator', title: 'Divide (÷)' },
  { label: '(', value: '(', type: 'paren', title: 'Open Parenthesis (' },
  { label: ')', value: ')', type: 'paren', title: 'Close Parenthesis )' },
];

/**
 * ExpressionWorkspace Component (Milestone 6.4 — Phases A, B, & C)
 *
 * Provides the interactive Expression Assembly, Step-by-Step Solver, & Practice Mode:
 * - Phase A: Expression Ribbon displaying accumulated tokens as visual chips.
 * - Phase A: Append-to-end editing model, backspace (⌫), token dismissal (×), and Clear All.
 * - Phase A: Operator strip (+, -, ×, ÷, (, )).
 * - Phase B: Live syntax readiness validation (EMPTY, READY, INCOMPLETE, SYNTAX_ERROR).
 * - Phase B: Integrated AST evaluation and step-by-step reduction drawer.
 * - Phase B: Graceful error handling for syntax and evaluation errors (e.g. division by zero).
 * - Phase C: Solver Mode vs. Practice Mode strict state isolation.
 * - Phase C: Independent Candidate Answer Buffer with air-writing digit capture.
 * - Phase C: Sign toggle (±), decimal point (.), backspace, clear, and digit pads.
 * - Phase C: Deterministic verification via verifyAnswer with anti-spoiler feedback rules.
 *
 * @param {object} props
 * @param {Array<{ id: string, type: string, value: string, display: string }>} props.tokens - Accumulated tokens
 * @param {Function} props.onAppendToken - (value, type) => void
 * @param {Function} props.onRemoveToken - (index) => void
 * @param {Function} props.onBackspace - () => void
 * @param {Function} props.onClearAll - () => void
 * @param {boolean} [props.initialSolved=false] - Optional initial solved state for testing/SSR
 * @param {Function} [props.onSolve] - (result) => void
 * @param {Function} [props.onError] - (errorMessage) => void
 * @param {'solver' | 'practice'} [props.mode='solver'] - Active workspace mode
 * @param {Function} [props.onModeChange] - (newMode) => void
 * @param {Array<string>} [props.answerDigits] - Candidate answer digits (Practice Mode)
 * @param {'+' | '-'} [props.answerSign='+'] - Candidate answer sign
 * @param {Function} [props.onAppendAnswerDigit] - (digit) => void
 * @param {Function} [props.onBackspaceAnswer] - () => void
 * @param {Function} [props.onClearAnswer] - () => void
 * @param {Function} [props.onToggleSign] - () => void
 * @param {Function} [props.onAddDecimal] - () => void
 * @param {object} [props.initialPracticeResult] - Optional initial practice result for testing
 */
export default function ExpressionWorkspace({
  tokens = [],
  onAppendToken,
  onRemoveToken,
  onBackspace,
  onClearAll,
  initialSolved = false,
  onSolve,
  onError,
  mode: propMode,
  onModeChange,
  answerDigits: propAnswerDigits,
  answerSign: propAnswerSign,
  onAppendAnswerDigit,
  onBackspaceAnswer,
  onClearAnswer,
  onToggleSign,
  onAddDecimal,
  initialPracticeResult = null,
}) {
  const tokenCount = tokens.length;

  // Milestone 6.4 (Phase C): Solver vs. Practice Mode State Management
  const [internalMode, setInternalMode] = useState('solver');
  const activeMode = propMode !== undefined ? propMode : internalMode;

  // Milestone 6.4 (Phase C): Candidate Answer Buffer State (Controlled or Uncontrolled fallback)
  const [internalAnswerDigits, setInternalAnswerDigits] = useState([]);
  const activeAnswerDigits = propAnswerDigits !== undefined ? propAnswerDigits : internalAnswerDigits;

  const [internalAnswerSign, setInternalAnswerSign] = useState('+');
  const activeAnswerSign = propAnswerSign !== undefined ? propAnswerSign : internalAnswerSign;

  const [practiceResult, setPracticeResult] = useState(initialPracticeResult);
  const [showSolutionInPractice, setShowSolutionInPractice] = useState(false);

  // Build readable expression string for readout / preview
  const assembledExpressionString = tokens.map((t) => t.display || t.value).join(' ');

  // Milestone 6.4 (Phase B): Live Syntax Readiness Validation
  const syntaxStatus = useMemo(() => {
    if (!tokens || tokens.length === 0) {
      return {
        status: 'EMPTY',
        badge: '✏️ Empty',
        className: 'status-empty',
        message: 'Air-write digits or click operators to construct an expression.',
        isReady: false,
        ast: null,
      };
    }

    try {
      const ast = parseExpression(tokens);
      return {
        status: 'READY',
        badge: '✓ Ready to Solve',
        className: 'status-ready',
        message: 'Valid arithmetic expression. Click "Solve Expression" to compute.',
        isReady: true,
        ast,
      };
    } catch (err) {
      if (err instanceof ParseError) {
        const isIncomplete =
          err.code === 'UNEXPECTED_EOF' ||
          err.message.includes('expected operand after') ||
          err.message.includes('expected an operand') ||
          err.message.includes('Unmatched opening parenthesis');

        return {
          status: isIncomplete ? 'INCOMPLETE' : 'SYNTAX_ERROR',
          badge: isIncomplete ? '⏳ Incomplete' : '⚠️ Syntax Error',
          className: isIncomplete ? 'status-incomplete' : 'status-error',
          message: err.message,
          isReady: false,
          ast: null,
          error: err,
        };
      }

      return {
        status: 'SYNTAX_ERROR',
        badge: '⚠️ Error',
        className: 'status-error',
        message: err.message || 'Syntax error',
        isReady: false,
        ast: null,
        error: err,
      };
    }
  }, [tokens]);

  // Milestone 6.4 (Phase B): Solver Mode State
  const [solvedResult, setSolvedResult] = useState(() => {
    if (initialSolved && tokens && tokens.length > 0) {
      try {
        return evaluateExpression(tokens);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [evaluationError, setEvaluationError] = useState(() => {
    if (initialSolved && tokens && tokens.length > 0) {
      try {
        evaluateExpression(tokens);
      } catch (err) {
        return err.message;
      }
    }
    return null;
  });

  const [showSteps, setShowSteps] = useState(true);

  // Invalidate previous solution and practice results if tokens are modified (React recommended pattern)
  const [prevTokens, setPrevTokens] = useState(tokens);
  if (tokens !== prevTokens) {
    setPrevTokens(tokens);
    setSolvedResult(null);
    setEvaluationError(null);
    setPracticeResult(null);
    setShowSolutionInPractice(false);
  }

  // Milestone 6.4 (Phase C): Safe Mode Switching
  const handleModeSwitch = useCallback((newMode) => {
    if (newMode === activeMode) return;
    setSolvedResult(null);
    setEvaluationError(null);
    setPracticeResult(null);
    setShowSolutionInPractice(false);

    if (onClearAnswer) onClearAnswer();
    setInternalAnswerDigits([]);
    setInternalAnswerSign('+');

    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }
  }, [activeMode, onModeChange, onClearAnswer]);

  // Milestone 6.4 (Phase C): Candidate Answer Buffer Handlers
  const handleAnswerAppend = useCallback((digit) => {
    setPracticeResult(null);
    if (onAppendAnswerDigit) {
      onAppendAnswerDigit(digit);
    } else {
      setInternalAnswerDigits((prev) => [...prev, String(digit)]);
    }
  }, [onAppendAnswerDigit]);

  const handleAnswerBackspace = useCallback(() => {
    setPracticeResult(null);
    if (onBackspaceAnswer) {
      onBackspaceAnswer();
    } else {
      setInternalAnswerDigits((prev) => prev.slice(0, -1));
    }
  }, [onBackspaceAnswer]);

  const handleAnswerClear = useCallback(() => {
    setPracticeResult(null);
    if (onClearAnswer) {
      onClearAnswer();
    } else {
      setInternalAnswerDigits([]);
    }
  }, [onClearAnswer]);

  const handleAnswerToggleSign = useCallback(() => {
    setPracticeResult(null);
    if (onToggleSign) {
      onToggleSign();
    } else {
      setInternalAnswerSign((prev) => (prev === '+' ? '-' : '+'));
    }
  }, [onToggleSign]);

  const handleAnswerAddDecimal = useCallback(() => {
    setPracticeResult(null);
    if (onAddDecimal) {
      onAddDecimal();
    } else {
      setInternalAnswerDigits((prev) => {
        if (prev.includes('.')) return prev;
        if (prev.length === 0) return ['0', '.'];
        return [...prev, '.'];
      });
    }
  }, [onAddDecimal]);

  // Milestone 6.4 (Phase C): Solution Verification Trigger
  const handleCheckAnswer = useCallback(() => {
    if (activeAnswerDigits.length === 0 || !syntaxStatus.isReady) return;
    const candidateStr = (activeAnswerSign === '-' ? '-' : '') + activeAnswerDigits.join('');
    const result = verifyAnswer(tokens, candidateStr);
    setPracticeResult(result);
    setShowSolutionInPractice(false);
  }, [activeAnswerDigits, activeAnswerSign, syntaxStatus, tokens]);

  const handleSolve = useCallback(() => {
    if (!syntaxStatus.isReady) return;
    try {
      setEvaluationError(null);
      const res = evaluateExpression(tokens);
      setSolvedResult(res);
      setShowSteps(true);
      if (onSolve) onSolve(res);
    } catch (err) {
      setSolvedResult(null);
      const errorMsg =
        err instanceof EvaluationError ? err.message : (err.message || 'An error occurred during evaluation');
      setEvaluationError(errorMsg);
      if (onError) onError(errorMsg);
    }
  }, [syntaxStatus, tokens, onSolve, onError]);

  const handleDismissSolution = useCallback(() => {
    setSolvedResult(null);
    setEvaluationError(null);
  }, []);

  const candidateAnswerString =
    (activeAnswerSign === '-' ? '-' : '') + (activeAnswerDigits.length === 0 ? '' : activeAnswerDigits.join(''));

  return (
    <div className="expression-workspace-card" aria-label="Mathematical Expression Workspace" id="expression-workspace">
      {/* Milestone 6.4 (Phase C): Mode Switcher Toolbar */}
      <div className="workspace-mode-toolbar">
        <div className="workspace-title-group">
          <span className="workspace-icon">📐</span>
          <h3 className="workspace-title">Math Workspace</h3>
        </div>

        <div className="workspace-mode-selector" role="tablist" aria-label="Workspace Mode">
          <button
            type="button"
            className={`mode-tab-btn ${activeMode === 'solver' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('solver')}
            role="tab"
            aria-selected={activeMode === 'solver'}
            id="tab-mode-solver"
          >
            ⚡ Solver Mode
          </button>
          <button
            type="button"
            className={`mode-tab-btn ${activeMode === 'practice' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('practice')}
            role="tab"
            aria-selected={activeMode === 'practice'}
            id="tab-mode-practice"
          >
            🎯 Practice Mode
          </button>
        </div>
      </div>

      <div className="workspace-header">
        <div className="workspace-title-group">
          <span className="ribbon-label">
            {activeMode === 'practice' ? 'Problem Expression:' : 'Expression Ribbon:'}
          </span>
          <span className="token-count-pill" title="Number of tokens in expression">
            {`${tokenCount} ${tokenCount === 1 ? 'symbol' : 'symbols'}`}
          </span>
          <span className={`syntax-status-badge ${syntaxStatus.className}`} id="syntax-status-badge">
            {syntaxStatus.badge}
          </span>
          {activeMode === 'practice' && (
            <span className="problem-locked-pill" title="Problem expression is locked while in Practice Mode">
              🔒 Locked
            </span>
          )}
        </div>
        <div className="workspace-header-actions">
          <button
            type="button"
            className="btn-workspace-action btn-backspace"
            onClick={onBackspace}
            disabled={tokenCount === 0 || activeMode === 'practice'}
            title={activeMode === 'practice' ? 'Cannot edit problem in Practice Mode' : 'Remove the last token (Backspace)'}
            id="btn-expr-backspace"
          >
            ⌫ Backspace
          </button>
          <button
            type="button"
            className="btn-workspace-action btn-clear-expr"
            onClick={onClearAll}
            disabled={tokenCount === 0 || activeMode === 'practice'}
            title={activeMode === 'practice' ? 'Cannot clear problem in Practice Mode' : 'Clear all tokens in expression'}
            id="btn-expr-clear"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Expression Ribbon: Displays the sequence of assembled tokens */}
      <div className={`expression-ribbon-container ${activeMode === 'practice' ? 'ribbon-locked' : ''}`}>
        <div className="expression-ribbon" role="region" aria-label="Assembled Expression Ribbon">
          {tokenCount === 0 ? (
            <span className="ribbon-placeholder">
              {activeMode === 'practice'
                ? 'No problem loaded. Switch to Solver Mode to build an expression first.'
                : 'Air-write a digit above or click an operator below to build an expression...'}
            </span>
          ) : (
            tokens.map((token, index) => {
              const isOperator = token.type === 'operator';
              const isParen = token.type === 'paren';

              let chipClass = 'token-chip-digit';
              if (isOperator) chipClass = 'token-chip-operator';
              if (isParen) chipClass = 'token-chip-paren';

              return (
                <div
                  key={token.id || `${token.value}_${index}`}
                  className={`token-chip ${chipClass}`}
                  title={`Token: ${token.display || token.value}${activeMode === 'solver' ? ' (click × to remove)' : ''}`}
                >
                  <span className="token-chip-val">{token.display || token.value}</span>
                  {activeMode === 'solver' && (
                    <button
                      type="button"
                      className="token-chip-delete"
                      onClick={() => onRemoveToken && onRemoveToken(index)}
                      aria-label={`Remove ${token.display || token.value}`}
                      title="Remove this token"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Operator Strip (Available in Solver Mode to construct expressions) */}
      {activeMode === 'solver' && (
        <div className="operator-strip-row" aria-label="Arithmetic Operators & Parentheses">
          <span className="operator-strip-label">Operators:</span>
          <div className="operator-buttons-group">
            {OPERATOR_BUTTONS.map((op) => (
              <button
                key={op.label}
                type="button"
                className={`btn-operator-chip ${op.type === 'paren' ? 'btn-paren' : ''}`}
                onClick={() => onAppendToken && onAppendToken(op.value, op.type)}
                title={op.title}
                id={`btn-op-${op.value === '*' ? 'mul' : op.value === '/' ? 'div' : op.value === '(' ? 'lparen' : op.value === ')' ? 'rparen' : op.value === '+' ? 'plus' : 'minus'}`}
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live Assembled Expression String Preview */}
      {tokenCount > 0 && (
        <div className="expression-preview-row">
          <span className="preview-label">Expression String:</span>
          <code className="preview-string">{assembledExpressionString}</code>
        </div>
      )}

      {/* =========================================================================
          SOLVER MODE: Live Syntax Status Bar & Solve Action Controls
          ========================================================================= */}
      {activeMode === 'solver' && (
        <div className="workspace-syntax-bar" aria-label="Expression Syntax Status and Solver Controls">
          <div className="syntax-status-indicator">
            <span className="syntax-status-message" id="syntax-status-message">{syntaxStatus.message}</span>
          </div>

          <button
            type="button"
            className="btn-solve-expression"
            onClick={handleSolve}
            disabled={!syntaxStatus.isReady}
            title={syntaxStatus.isReady ? 'Solve this mathematical expression step-by-step' : 'Complete expression to solve'}
            id="btn-solve-expression"
          >
            <span className="btn-solve-icon">⚡</span>
            <span>Solve Expression</span>
          </button>
        </div>
      )}

      {/* =========================================================================
          PRACTICE MODE: Candidate Answer Capture Buffer & Verifier Controls
          ========================================================================= */}
      {activeMode === 'practice' && (
        <div className="practice-workspace-section" aria-label="Practice Mode Answer Capture" id="practice-workspace-section">
          <div className="practice-section-header">
            <span className="practice-section-badge">Student Practice Buffer</span>
            <span className="practice-hint">
              Air-write your answer digits above or use controls below, then check your work.
            </span>
          </div>

          <div className="practice-answer-card">
            {/* Display Area for Candidate Answer */}
            <div className="candidate-answer-row">
              <span className="candidate-answer-label">My Answer:</span>
              <div className="candidate-answer-display" id="candidate-answer-display">
                <span className="answer-sign-prefix">{activeAnswerSign === '-' ? '-' : ''}</span>
                <span className="answer-digits-text">
                  {activeAnswerDigits.length === 0 ? (
                    <span className="answer-placeholder">Enter answer...</span>
                  ) : (
                    activeAnswerDigits.join('')
                  )}
                </span>
              </div>

              <div className="candidate-answer-actions">
                <button
                  type="button"
                  className="btn-answer-action btn-ans-backspace"
                  onClick={handleAnswerBackspace}
                  disabled={activeAnswerDigits.length === 0}
                  title="Remove last answer digit"
                  id="btn-ans-backspace"
                >
                  ⌫
                </button>
                <button
                  type="button"
                  className="btn-answer-action btn-ans-clear"
                  onClick={handleAnswerClear}
                  disabled={activeAnswerDigits.length === 0}
                  title="Clear answer buffer"
                  id="btn-ans-clear"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Answer Modifier & Digit Toolstrip */}
            <div className="answer-modifiers-row">
              <div className="modifier-controls-group">
                <button
                  type="button"
                  className={`btn-ans-modifier btn-ans-sign ${activeAnswerSign === '-' ? 'sign-negative' : ''}`}
                  onClick={handleAnswerToggleSign}
                  title="Toggle positive/negative sign (±)"
                  id="btn-ans-toggle-sign"
                >
                  ± {activeAnswerSign === '-' ? '(-)' : '(+)'}
                </button>
                <button
                  type="button"
                  className="btn-ans-modifier btn-ans-decimal"
                  onClick={handleAnswerAddDecimal}
                  disabled={activeAnswerDigits.includes('.')}
                  title="Add decimal point (.)"
                  id="btn-ans-decimal"
                >
                  .
                </button>
              </div>

              {/* Touch/Click Quick Digit Keypad (0–9) */}
              <div className="answer-digit-pad" aria-label="Quick Digit Keypad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className="btn-ans-digit"
                    onClick={() => handleAnswerAppend(String(num))}
                    title={`Input ${num}`}
                    id={`btn-ans-digit-${num}`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn-check-answer"
                onClick={handleCheckAnswer}
                disabled={activeAnswerDigits.length === 0 || !syntaxStatus.isReady}
                title={
                  !syntaxStatus.isReady
                    ? 'Valid problem expression required'
                    : activeAnswerDigits.length === 0
                    ? 'Enter an answer first'
                    : 'Check your candidate answer'
                }
                id="btn-check-answer"
              >
                <span>🎯 Check Answer</span>
              </button>
            </div>
          </div>

          {/* Practice Verification Feedback Banner (Strict Anti-Spoiler Policy) */}
          {practiceResult && (
            <div className="practice-feedback-container" aria-live="polite" id="practice-feedback-container">
              {practiceResult.isCorrect ? (
                <div className="practice-feedback-card feedback-correct" id="practice-feedback-correct">
                  <div className="feedback-header">
                    <span className="feedback-icon">✓</span>
                    <div className="feedback-body">
                      <h4 className="feedback-title">Correct!</h4>
                      <p className="feedback-msg">
                        Your answer <strong>{candidateAnswerString}</strong> matches the ground truth. Excellent work!
                      </p>
                    </div>
                  </div>
                  <div className="feedback-actions">
                    <button
                      type="button"
                      className="btn-toggle-practice-solution"
                      onClick={() => setShowSolutionInPractice((prev) => !prev)}
                      id="btn-toggle-practice-steps"
                    >
                      {showSolutionInPractice ? '▲ Hide Solution Steps' : '👁️ View Reduction Steps'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="practice-feedback-card feedback-incorrect" id="practice-feedback-incorrect">
                  <div className="feedback-header">
                    <span className="feedback-icon">⚠️</span>
                    <div className="feedback-body">
                      <h4 className="feedback-title">Incorrect — Try Again</h4>
                      <p className="feedback-msg">
                        Your answer <strong>{candidateAnswerString}</strong> is not correct for this expression.
                      </p>
                      {/* Conservative Heuristic Misconception Diagnostic (Ground truth unrevealed!) */}
                      {practiceResult.heuristicDiagnostic && (
                        <div className="heuristic-diagnostic-card">
                          <span className="diagnostic-category-badge">
                            Heuristic: {practiceResult.heuristicDiagnostic.category.replace(/_/g, ' ')}
                          </span>
                          <p className="diagnostic-explanation">
                            {practiceResult.heuristicDiagnostic.message}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="feedback-hint">
                    Use the backspace or digit pad to adjust your candidate answer and check again.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reveal Solution Steps in Practice Mode (Only on explicit click after correct verification) */}
          {practiceResult && practiceResult.isCorrect && showSolutionInPractice && practiceResult.reference && (
            <div className="practice-solution-drawer" id="practice-solution-drawer">
              <div className="solver-result-card" role="region" aria-label="Step-by-Step Solution">
                <div className="solver-result-header">
                  <div className="solver-result-title-group">
                    <span className="solver-result-badge">Verified Solution</span>
                    <div className="final-result-display">
                      <span className="result-label">Result =</span>
                      <span className="final-result-val">{practiceResult.reference.formatted}</span>
                    </div>
                  </div>
                  <span className="reduction-step-pill">
                    {`${practiceResult.reference.stepCount} ${practiceResult.reference.stepCount === 1 ? 'step' : 'steps'}`}
                  </span>
                </div>

                {practiceResult.reference.stepCount > 0 && (
                  <div className="reduction-steps-container">
                    <div className="reduction-steps-list">
                      {practiceResult.reference.steps.map((step) => (
                        <div key={`prac_step_${step.stepIndex}`} className="reduction-step-card">
                          <div className="step-card-header">
                            <span className="step-badge">{`Step ${step.stepIndex}`}</span>
                            <span className="step-operation-pill">
                              {step.operation.replace(/\*/g, '×').replace(/\//g, '÷')}
                            </span>
                          </div>
                          <div className="step-card-body">
                            <div className="step-transition">
                              <span className="step-transition-label">Expression:</span>
                              <code className="expr-before">{step.beforeExpression.replace(/\*/g, '×').replace(/\//g, '÷')}</code>
                              <span className="transition-arrow">➔</span>
                              <code className="expr-after">{step.afterExpression.replace(/\*/g, '×').replace(/\//g, '÷')}</code>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SOLVER MODE: Reduction Step Drawer & Solution View
          ========================================================================= */}
      {activeMode === 'solver' && evaluationError && (
        <div className="solver-error-banner" role="alert" aria-live="polite" id="solver-eval-error">
          <span className="error-icon">⚠️</span>
          <div className="error-content">
            <strong>Evaluation Error:</strong> {evaluationError}
          </div>
          <button
            type="button"
            className="btn-dismiss-banner"
            onClick={handleDismissSolution}
            title="Dismiss error"
            aria-label="Dismiss error banner"
          >
            ×
          </button>
        </div>
      )}

      {activeMode === 'solver' && solvedResult && (
        <div className="solver-result-card" role="region" aria-label="Step-by-Step Solution" id="solver-result-drawer">
          <div className="solver-result-header">
            <div className="solver-result-title-group">
              <span className="solver-result-badge">Solution</span>
              <div className="final-result-display">
                <span className="result-label">Result =</span>
                <span className="final-result-val" id="solver-final-value">{solvedResult.formattedResult}</span>
              </div>
            </div>

            <div className="solver-header-controls">
              <span className="reduction-step-pill" title="Total intermediate reductions">
                {`${solvedResult.stepCount} ${solvedResult.stepCount === 1 ? 'step' : 'steps'}`}
              </span>
              {solvedResult.stepCount > 0 && (
                <button
                  type="button"
                  className="btn-toggle-steps"
                  onClick={() => setShowSteps((prev) => !prev)}
                  title={showSteps ? 'Collapse step-by-step reductions' : 'Expand step-by-step reductions'}
                  id="btn-toggle-reduction-steps"
                >
                  {showSteps ? '▲ Hide Steps' : '▼ Show Steps'}
                </button>
              )}
              <button
                type="button"
                className="btn-dismiss-solution"
                onClick={handleDismissSolution}
                title="Dismiss solution"
                aria-label="Dismiss solution view"
                id="btn-dismiss-solution"
              >
                ×
              </button>
            </div>
          </div>

          {/* Reduction Step Sequence Drawer */}
          {showSteps && solvedResult.stepCount > 0 && (
            <div className="reduction-steps-container" aria-label="Step-by-step reductions">
              <div className="reduction-steps-list">
                {solvedResult.steps.map((step) => (
                  <div key={`step_${step.stepIndex}`} className="reduction-step-card">
                    <div className="step-card-header">
                      <span className="step-badge">{`Step ${step.stepIndex}`}</span>
                      <span className="step-operation-pill">
                        {step.operation.replace(/\*/g, '×').replace(/\//g, '÷')}
                      </span>
                    </div>
                    <div className="step-card-body">
                      <div className="step-transition">
                        <span className="step-transition-label">Expression:</span>
                        <code className="expr-before">{step.beforeExpression.replace(/\*/g, '×').replace(/\//g, '÷')}</code>
                        <span className="transition-arrow">➔</span>
                        <code className="expr-after">{step.afterExpression.replace(/\*/g, '×').replace(/\//g, '÷')}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="reduction-conclusion-card">
                <span className="conclusion-icon">🎯</span>
                <span className="conclusion-text">
                  Final reduced value is <strong>{solvedResult.formattedResult}</strong>.
                </span>
              </div>
            </div>
          )}

          {/* Single literal edge case (stepCount === 0) */}
          {solvedResult.stepCount === 0 && (
            <div className="reduction-single-literal-note">
              Expression is already an irreducible literal value.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
