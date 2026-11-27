import React, { useState, useMemo, useCallback } from 'react';
import { parseExpression, ParseError } from '../services/expressionParser.js';
import { evaluateExpression, EvaluationError } from '../services/expressionEvaluator.js';
import { verifyAnswer, verifySingleStep } from '../services/solutionVerifier.js';
import {
  classifyStepError,
  generateProgressiveHint,
  translateCategoryLabel,
} from '../services/educationalFeedback.js';
import { createSessionMistakeTracker } from '../services/sessionMistakeTracker.js';

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
 * @param {'step' | 'direct'} [props.practiceSubMode] - Active Practice Sub-Mode ('step' | 'direct')
 * @param {'step' | 'direct'} [props.initialPracticeSubMode] - Initial Practice Sub-Mode fallback
 * @param {Function} [props.onPracticeSubModeChange] - (newSubMode) => void
 * @param {Array<{ id: string, type: string, value: string, display: string }>} [props.stepTokens] - Step candidate tokens
 * @param {Function} [props.onAppendStepToken] - (value, type) => void
 * @param {Function} [props.onRemoveStepToken] - (index) => void
 * @param {Function} [props.onBackspaceStep] - () => void
 * @param {Function} [props.onClearStep] - () => void
 * @param {Function} [props.onSetStepTokens] - (tokens) => void
 * @param {Array<{ stepIndex: number, expression: string, reductionNote?: string }>} [props.stepHistory] - Verified step history
 * @param {Function} [props.onCheckStep] - (stepExpressionString) => void
 * @param {Array<object>} [props.initialStepCandidate] - Optional initial step candidate for testing
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
  practiceSubMode: propPracticeSubMode,
  initialPracticeSubMode,
  onPracticeSubModeChange,
  stepTokens: propStepTokens,
  onAppendStepToken,
  onRemoveStepToken,
  onBackspaceStep,
  onClearStep,
  onSetStepTokens,
  stepHistory: propStepHistory,
  onSetStepHistory,
  workingTokens: propWorkingTokens,
  onSetWorkingTokens,
  onStepVerified,
  onStepRejected,
  onStepComplete,
  initialStepHistory = null,
  initialStepFeedback = null,
  initialActiveHint = null,
  initialHintLevel = 1,
  initialTrackerSummary = null,
  onCheckStep,
  initialStepCandidate = null,
}) {
  const tokenCount = tokens.length;

  // Milestone 6.4 (Phase C): Solver vs. Practice Mode State Management
  const [internalMode, setInternalMode] = useState('solver');
  const activeMode = propMode !== undefined ? propMode : internalMode;

  // Milestone 7.1 (Phase B): Practice Sub-Mode ('step' | 'direct')
  // Default to 'direct' if propAnswerDigits is passed without propPracticeSubMode (backward compatibility for M6.4 tests),
  // otherwise default to initialPracticeSubMode or 'step'.
  const defaultSubMode =
    propPracticeSubMode !== undefined
      ? propPracticeSubMode
      : propAnswerDigits !== undefined && initialPracticeSubMode === undefined
      ? 'direct'
      : initialPracticeSubMode || 'step';

  const [internalPracticeSubMode, setInternalPracticeSubMode] = useState(defaultSubMode);
  const activePracticeSubMode = propPracticeSubMode !== undefined ? propPracticeSubMode : internalPracticeSubMode;

  const handlePracticeSubModeSwitch = useCallback((newSubMode) => {
    if (newSubMode === activePracticeSubMode) return;
    if (onPracticeSubModeChange) {
      onPracticeSubModeChange(newSubMode);
    } else {
      setInternalPracticeSubMode(newSubMode);
    }
  }, [activePracticeSubMode, onPracticeSubModeChange]);

  // Milestone 7.1 (Phase B): Step Candidate Ribbon State (Controlled or Uncontrolled fallback)
  const [internalStepTokens, setInternalStepTokens] = useState(() => {
    if (initialStepCandidate && Array.isArray(initialStepCandidate)) {
      return initialStepCandidate;
    }
    return [];
  });
  const activeStepTokens = propStepTokens !== undefined ? propStepTokens : internalStepTokens;
  const stepTokenCount = activeStepTokens.length;

  // Milestone 7.1 (Phase C): Step History & Interactive Working State
  const [internalStepHistory, setInternalStepHistory] = useState(() => {
    if (initialStepHistory && Array.isArray(initialStepHistory)) {
      return initialStepHistory;
    }
    return [];
  });
  const stepHistoryList = propStepHistory !== undefined ? propStepHistory : internalStepHistory;

  const [internalWorkingTokens, setInternalWorkingTokens] = useState(() => tokens);
  const activeWorkingTokens = propWorkingTokens !== undefined ? propWorkingTokens : internalWorkingTokens;
  const workingExpressionString =
    (activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens)
      .map((t) => t.display || t.value)
      .join(' ');

  // Milestone 7.1/7.2: Step Verification Feedback, Anti-Spoiler Progressive Hints & Completion State
  const [stepFeedback, setStepFeedback] = useState(initialStepFeedback || null);
  const [hintLevel, setHintLevel] = useState(initialHintLevel || 1);
  const [activeHint, setActiveHint] = useState(initialActiveHint || null);

  // Milestone 7.2 (Phase D): In-Memory Session-Local Mistake Tracker
  const [mistakeTracker] = useState(() => createSessionMistakeTracker({ repetitionThreshold: 2 }));
  const [trackerSummary, setTrackerSummary] = useState(
    () => initialTrackerSummary || mistakeTracker.getSummary()
  );
  const [isCompleted, setIsCompleted] = useState(() => {
    if (stepHistoryList.length > 0) {
      const last = stepHistoryList[stepHistoryList.length - 1];
      return last.status === 'COMPLETED';
    }
    return false;
  });

  const handleStepAppend = useCallback((value, type = 'digit') => {
    if (!value) return;
    const displayMap = { '*': '×', '/': '÷' };
    const newToken = {
      id: `step_tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      value: String(value),
      display: displayMap[value] || String(value),
    };
    if (onAppendStepToken) {
      onAppendStepToken(value, type);
    } else if (onSetStepTokens) {
      onSetStepTokens([...activeStepTokens, newToken]);
    } else {
      setInternalStepTokens((prev) => [...prev, newToken]);
    }
  }, [activeStepTokens, onAppendStepToken, onSetStepTokens]);

  const handleStepRemove = useCallback((index) => {
    if (onRemoveStepToken) {
      onRemoveStepToken(index);
    } else if (onSetStepTokens) {
      onSetStepTokens(activeStepTokens.filter((_, i) => i !== index));
    } else {
      setInternalStepTokens((prev) => prev.filter((_, i) => i !== index));
    }
  }, [activeStepTokens, onRemoveStepToken, onSetStepTokens]);

  const handleStepBackspace = useCallback(() => {
    if (onBackspaceStep) {
      onBackspaceStep();
    } else if (onSetStepTokens) {
      onSetStepTokens(activeStepTokens.slice(0, -1));
    } else {
      setInternalStepTokens((prev) => prev.slice(0, -1));
    }
  }, [activeStepTokens, onBackspaceStep, onSetStepTokens]);

  const handleStepClear = useCallback(() => {
    if (onClearStep) {
      onClearStep();
    } else if (onSetStepTokens) {
      onSetStepTokens([]);
    } else {
      setInternalStepTokens([]);
    }
  }, [onClearStep, onSetStepTokens]);

  // Milestone 7.1 (Phase B/C): Copy Current Working Expression to Step Ribbon
  const handleCopyCurrent = useCallback(() => {
    const sourceTokens = activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens;
    const cloned = sourceTokens.map((t, idx) => ({
      id: `step_tok_${Date.now()}_${idx}`,
      type: t.type,
      value: t.value,
      display: t.display || t.value,
    }));
    if (onSetStepTokens) {
      onSetStepTokens(cloned);
    } else {
      setInternalStepTokens(cloned);
    }
  }, [activeWorkingTokens, tokens, onSetStepTokens]);

  const stepCandidateString = activeStepTokens.map((t) => t.display || t.value).join(' ');

  const stepSyntaxStatus = useMemo(() => {
    if (!activeStepTokens || activeStepTokens.length === 0) {
      return {
        status: 'EMPTY',
        badge: '✏️ Empty Step',
        className: 'status-empty',
        message: 'Assemble your next simplified expression step below.',
        isReady: false,
        ast: null,
      };
    }

    try {
      const ast = parseExpression(activeStepTokens);
      return {
        status: 'READY',
        badge: '✓ Step Ready',
        className: 'status-ready',
        message: 'Valid arithmetic expression. Ready to check your step.',
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
          badge: isIncomplete ? '⏳ Incomplete Step' : '⚠️ Step Syntax Error',
          className: isIncomplete ? 'status-incomplete' : 'status-error',
          message: err.message,
          isReady: false,
          ast: null,
          error: err,
        };
      }

      return {
        status: 'SYNTAX_ERROR',
        badge: '⚠️ Step Error',
        className: 'status-error',
        message: err.message || 'Syntax error in step',
        isReady: false,
        ast: null,
        error: err,
      };
    }
  }, [activeStepTokens]);

  // Milestone 7.1 (Phase C): Core Interactive Step Verification Loop
  const handleCheckStepAction = useCallback(() => {
    if (!stepSyntaxStatus.isReady) return;
    const prevExprTokens = activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens;
    if (!prevExprTokens || prevExprTokens.length === 0) return;

    const result = verifySingleStep(prevExprTokens, activeStepTokens);
    let educationalResult = null;
    try {
      educationalResult = classifyStepError(prevExprTokens, activeStepTokens, result);
    } catch {
      educationalResult = null;
    }

    const mergedFeedback = {
      ...result,
      feedback: {
        ...result.feedback,
        title: educationalResult?.title || result.feedback?.title || (result.isValid ? 'Valid Step!' : 'Step Error'),
        message: educationalResult?.explanation || result.feedback?.message,
        category: educationalResult?.category || result.feedback?.category,
        remediationAdvice: educationalResult?.remediationAdvice || null,
        confidence: educationalResult?.confidence || 'DEFINITIVE',
        suggestedHintLevel: educationalResult?.suggestedHintLevel || 1,
      },
      educational: educationalResult,
    };
    setStepFeedback(mergedFeedback);

    if (result.isValid) {
      const newStepIndex = stepHistoryList.length + 1;
      const reductionNote =
        result.status === 'COMPLETED'
          ? `Final result: ${result.formattedResult}`
          : result.feedback?.message || `Reduced step ${newStepIndex}`;

      const historyItem = {
        stepIndex: newStepIndex,
        previousExpression: prevExprTokens.map((t) => t.display || t.value).join(' '),
        expression: activeStepTokens.map((t) => t.display || t.value).join(' '),
        tokens: [...activeStepTokens],
        reductionNote,
        status: result.status,
      };

      const updatedHistory = [...stepHistoryList, historyItem];
      if (onSetStepHistory) {
        onSetStepHistory(updatedHistory);
      } else {
        setInternalStepHistory(updatedHistory);
      }

      if (onSetWorkingTokens) {
        onSetWorkingTokens([...activeStepTokens]);
      } else {
        setInternalWorkingTokens([...activeStepTokens]);
      }

      if (onSetStepTokens) {
        onSetStepTokens([]);
      } else {
        setInternalStepTokens([]);
      }

      setActiveHint(null);
      setHintLevel(1);

      if (result.status === 'COMPLETED' || result.isComplete) {
        setIsCompleted(true);
        mistakeTracker.reset();
        setTrackerSummary(mistakeTracker.getSummary());
        if (onStepComplete) onStepComplete(result);
      }

      if (onStepVerified) onStepVerified(result);
    } else {
      if (educationalResult?.category) {
        const updated = mistakeTracker.recordMistake(
          educationalResult.category,
          stepHistoryList.length + 1,
          stepCandidateString
        );
        setTrackerSummary(updated);
      }
      if (onStepRejected) onStepRejected(result);
    }

    if (onCheckStep) onCheckStep(stepCandidateString, result);
  }, [
    stepSyntaxStatus.isReady,
    activeWorkingTokens,
    tokens,
    activeStepTokens,
    stepHistoryList,
    onSetStepHistory,
    onSetWorkingTokens,
    onSetStepTokens,
    onStepComplete,
    onStepVerified,
    onStepRejected,
    onCheckStep,
    stepCandidateString,
    mistakeTracker,
  ]);

  // Milestone 7.1 (Phase C): Undo Last Step Action
  const handleUndoStep = useCallback(() => {
    if (stepHistoryList.length === 0) return;

    const updatedHistory = stepHistoryList.slice(0, -1);
    if (onSetStepHistory) {
      onSetStepHistory(updatedHistory);
    } else {
      setInternalStepHistory(updatedHistory);
    }

    if (updatedHistory.length === 0) {
      if (onSetWorkingTokens) {
        onSetWorkingTokens([...tokens]);
      } else {
        setInternalWorkingTokens([...tokens]);
      }
    } else {
      const prevStep = updatedHistory[updatedHistory.length - 1];
      if (onSetWorkingTokens) {
        onSetWorkingTokens([...prevStep.tokens]);
      } else {
        setInternalWorkingTokens([...prevStep.tokens]);
      }
    }

    setIsCompleted(false);
    mistakeTracker.pruneToStep(updatedHistory.length);
    setTrackerSummary(mistakeTracker.getSummary());
    setStepFeedback({
      isValid: true,
      status: 'UNDO',
      feedback: {
        title: 'Step Undone',
        message: 'Reverted to the previous working expression. Try another reduction!',
      },
    });
    setActiveHint(null);
    setHintLevel(1);
  }, [stepHistoryList, onSetStepHistory, onSetWorkingTokens, tokens, mistakeTracker]);

  // Milestone 7.1 (Phase C): Restart Step-by-Step Sequence Action
  const handleRestartStepSequence = useCallback(() => {
    if (onSetStepHistory) {
      onSetStepHistory([]);
    } else {
      setInternalStepHistory([]);
    }

    if (onSetWorkingTokens) {
      onSetWorkingTokens([...tokens]);
    } else {
      setInternalWorkingTokens([...tokens]);
    }

    if (onSetStepTokens) {
      onSetStepTokens([]);
    } else {
      setInternalStepTokens([]);
    }

    setIsCompleted(false);
    mistakeTracker.reset();
    setTrackerSummary(mistakeTracker.getSummary());
    setStepFeedback(null);
    setActiveHint(null);
    setHintLevel(1);
  }, [onSetStepHistory, onSetWorkingTokens, tokens, onSetStepTokens, mistakeTracker]);

  // Milestone 7.2 (Phase C): Progressive Anti-Spoiler Hint Controls
  const handleToggleHint = useCallback(() => {
    if (activeHint) {
      setActiveHint(null);
      setHintLevel(1);
      return;
    }
    const currentExpr =
      activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens;
    const hint = generateProgressiveHint(currentExpr, 1);
    setHintLevel(1);
    setActiveHint(hint);
  }, [activeHint, activeWorkingTokens, tokens]);

  const handleNextHintLevel = useCallback(() => {
    const nextLevel = Math.min(3, hintLevel + 1);
    const currentExpr =
      activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens;
    const hint = generateProgressiveHint(currentExpr, nextLevel);
    setHintLevel(nextLevel);
    setActiveHint(hint);
  }, [hintLevel, activeWorkingTokens, tokens]);

  const handlePrevHintLevel = useCallback(() => {
    const prevLevel = Math.max(1, hintLevel - 1);
    const currentExpr =
      activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens;
    const hint = generateProgressiveHint(currentExpr, prevLevel);
    setHintLevel(prevLevel);
    setActiveHint(hint);
  }, [hintLevel, activeWorkingTokens, tokens]);

  const handleSelectHintLevel = useCallback(
    (targetLevel) => {
      const clampedLevel = Math.max(1, Math.min(3, targetLevel));
      const currentExpr =
        activeWorkingTokens && activeWorkingTokens.length > 0 ? activeWorkingTokens : tokens;
      const hint = generateProgressiveHint(currentExpr, clampedLevel);
      setHintLevel(clampedLevel);
      setActiveHint(hint);
    },
    [activeWorkingTokens, tokens]
  );

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
    setInternalStepTokens([]);
    setInternalWorkingTokens(tokens);
    setInternalStepHistory([]);
    setStepFeedback(null);
    setActiveHint(null);
    setIsCompleted(false);
  }

  // Milestone 6.4 (Phase C): Safe Mode Switching
  const handleModeSwitch = useCallback((newMode) => {
    if (newMode === activeMode) return;
    setSolvedResult(null);
    setEvaluationError(null);
    setPracticeResult(null);
    setShowSolutionInPractice(false);
    setStepFeedback(null);
    setActiveHint(null);

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
          PRACTICE MODE: Step-by-Step Learning & Direct Answer Modes
          ========================================================================= */}
      {activeMode === 'practice' && (
        <div className="practice-workspace-section" aria-label="Practice Mode Workspace" id="practice-workspace-section">
          {/* Milestone 7.1 (Phase B): Practice Sub-Mode Navigation */}
          <div className="practice-submode-toolbar" aria-label="Practice Sub-Mode Navigation">
            <div className="practice-submode-selector" role="tablist" aria-label="Practice Mode Selection">
              <button
                type="button"
                className={`submode-tab-btn ${activePracticeSubMode === 'step' ? 'active' : ''}`}
                onClick={() => handlePracticeSubModeSwitch('step')}
                role="tab"
                aria-selected={activePracticeSubMode === 'step'}
                id="tab-submode-step"
              >
                👣 Step-by-Step
              </button>
              <button
                type="button"
                className={`submode-tab-btn ${activePracticeSubMode === 'direct' ? 'active' : ''}`}
                onClick={() => handlePracticeSubModeSwitch('direct')}
                role="tab"
                aria-selected={activePracticeSubMode === 'direct'}
                id="tab-submode-direct"
              >
                🎯 Direct Answer
              </button>
            </div>
          </div>

          {/* =========================================================================
              MILESTONE 7.1 (PHASE B): Step-by-Step Learning Mode UI Skeleton
              ========================================================================= */}
          {activePracticeSubMode === 'step' && (
            <div className="step-practice-section" id="step-practice-section" aria-label="Step-by-Step Practice Workspace">
              <div className="step-section-header">
                <span className="step-section-badge">Step-by-Step Learning</span>
                <span className="step-section-hint">
                  Simplify the expression one operation at a time. Copy current expression or assemble your next step.
                </span>
              </div>

              {/* 1. Reference Problem & Current Working Expression Panels */}
              <div className="step-expressions-panel">
                <div className="step-reference-card" id="step-reference-card">
                  <span className="step-panel-label">Initial Problem:</span>
                  <code className="step-reference-expr" id="step-reference-expr">
                    {assembledExpressionString || 'No expression loaded'}
                  </code>
                </div>

                <div className="step-current-working-card" id="step-current-working-card">
                  <div className="working-card-header">
                    <span className="step-panel-label">Current Expression to Simplify:</span>
                    <div className="working-card-actions">
                      {stepHistoryList.length > 0 && !isCompleted && (
                        <button
                          type="button"
                          className="btn-undo-step"
                          id="btn-undo-step"
                          onClick={handleUndoStep}
                          title="Undo the last accepted step and revert current expression"
                        >
                          ↩ Undo Step
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-copy-current"
                        id="btn-copy-current-step"
                        onClick={handleCopyCurrent}
                        disabled={tokenCount === 0 || isCompleted}
                        title="Copy current expression into step ribbon for easy editing"
                      >
                        📋 Copy Current
                      </button>
                    </div>
                  </div>
                  <code className="step-working-expr" id="step-working-expr">
                    {workingExpressionString || 'No expression loaded'}
                  </code>
                </div>
              </div>

              {/* 2. Step History Timeline */}
              <div className="step-history-timeline-container" aria-label="Step Progression Timeline">
                <div className="step-timeline-header">
                  <span className="step-timeline-title">Solution Timeline:</span>
                  <div className="step-timeline-header-right">
                    <span className="step-timeline-count">
                      {stepHistoryList.length === 0 ? 'Starting Step 1' : `Completed ${stepHistoryList.length} step(s)`}
                    </span>
                    {stepHistoryList.length > 0 && (
                      <button
                        type="button"
                        className="btn-step-restart"
                        id="btn-step-restart"
                        onClick={handleRestartStepSequence}
                        title="Restart step-by-step simplification from the beginning"
                      >
                        ↺ Restart
                      </button>
                    )}
                  </div>
                </div>
                <div className="step-history-timeline" id="step-history-timeline">
                  <div className="timeline-node timeline-node-start">
                    <span className="node-badge">Start</span>
                    <code className="node-expr">{assembledExpressionString || '...'}</code>
                  </div>
                  {stepHistoryList.map((step, idx) => (
                    <div key={`hist_${idx}`} className="timeline-node timeline-node-step">
                      <span className="timeline-arrow">➔</span>
                      <span className="node-badge">{`Step ${step.stepIndex || idx + 1}`}</span>
                      <code className="node-expr">{step.expression}</code>
                      {step.reductionNote && <span className="node-note">{step.reductionNote}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Milestone 7.1 (Phase C): Step Verification Feedback Banner */}
              {stepFeedback && (
                <div className="step-feedback-container" id="step-feedback-container" aria-live="polite">
                  <div
                    className={`step-feedback-card ${
                      stepFeedback.isValid
                        ? stepFeedback.status === 'COMPLETED'
                          ? 'feedback-completed'
                          : 'feedback-valid'
                        : 'feedback-invalid'
                    }`}
                    id={
                      stepFeedback.isValid
                        ? stepFeedback.status === 'COMPLETED'
                          ? 'step-feedback-completed'
                          : 'step-feedback-valid'
                        : 'step-feedback-invalid'
                    }
                  >
                    <div className="step-feedback-header">
                      <span className="feedback-icon">
                        {stepFeedback.isValid ? (stepFeedback.status === 'COMPLETED' ? '🎉' : '✓') : '⚠️'}
                      </span>
                      <div className="feedback-body">
                        <div className="feedback-title-row">
                          <h4 className="feedback-title" id="step-feedback-title">
                            {stepFeedback.feedback?.title || (stepFeedback.isValid ? 'Valid Step!' : 'Step Error')}
                          </h4>
                          {stepFeedback.feedback?.category && (
                            <span
                              className="diagnostic-category-badge"
                              id="step-feedback-category"
                              title={String(stepFeedback.feedback.category).replace(/_/g, ' ')}
                              data-category={stepFeedback.feedback.category}
                            >
                              {translateCategoryLabel(stepFeedback.feedback.category) || String(stepFeedback.feedback.category).replace(/_/g, ' ')}
                            </span>
                          )}
                          {stepFeedback.feedback?.confidence && stepFeedback.feedback.confidence !== 'DEFINITIVE' && (
                            <span
                              className={`confidence-pill confidence-${String(stepFeedback.feedback.confidence).toLowerCase()}`}
                              id="step-feedback-confidence"
                              title={`Analysis confidence: ${String(stepFeedback.feedback.confidence).toLowerCase()}`}
                            >
                              {stepFeedback.feedback.confidence === 'PROBABLE' ? 'Probable' : 'Suggested'}
                            </span>
                          )}
                        </div>
                        <p className="feedback-msg" id="step-feedback-message">
                          {stepFeedback.feedback?.message}
                        </p>
                        {stepFeedback.feedback?.remediationAdvice && (
                          <div className="feedback-remediation-tip" id="step-feedback-remediation">
                            <span className="tip-badge">💡 Tip:</span>
                            <span className="tip-text">{stepFeedback.feedback.remediationAdvice}</span>
                          </div>
                        )}
                        {trackerSummary?.patternInsight && !stepFeedback.isValid && (
                          <div className="feedback-pattern-alert" id="step-pattern-alert" aria-label="Repeated Error Guidance">
                            <div className="pattern-alert-header">
                              <span className="pattern-alert-icon">🔄</span>
                              <span className="pattern-alert-title" id="pattern-alert-title">
                                {trackerSummary.patternInsight.title}
                              </span>
                              <span className="pattern-count-badge" id="pattern-alert-count">
                                {`Encountered ${trackerSummary.patternInsight.count}×`}
                              </span>
                            </div>
                            <p className="pattern-alert-msg" id="pattern-alert-message">
                              {trackerSummary.patternInsight.supportiveMessage}
                            </p>
                            <button
                              type="button"
                              className="btn-pattern-hint-action"
                              id="btn-pattern-hint-action"
                              onClick={() => handleSelectHintLevel(trackerSummary.patternInsight.recommendedHintLevel || 2)}
                              title="Open suggested hint level"
                            >
                              {`💡 Open Hint Level ${trackerSummary.patternInsight.recommendedHintLevel || 2} Guidance ➔`}
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-dismiss-feedback"
                        id="btn-dismiss-step-feedback"
                        onClick={() => setStepFeedback(null)}
                        title="Dismiss feedback"
                        aria-label="Dismiss feedback banner"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Milestone 7.2 (Phase C): Anti-Spoiler Progressive Guidance Hint Card */}
              {activeHint && (
                <div className="step-hint-card" id="step-hint-card" role="region" aria-label="Step Hint">
                  <div className="hint-card-header">
                    <div className="hint-header-title">
                      <span className="hint-icon">💡</span>
                      <h4 className="hint-title" id="step-hint-title">
                        {activeHint.title || 'Step Guidance'}
                      </h4>
                      <span className="hint-level-pill" id="step-hint-level-badge">
                        {`Level ${activeHint.level || hintLevel} of 3`}
                      </span>
                      <span className="anti-spoiler-pill" title="This guidance helps your thought process without spoiling answers">
                        🛡️ Anti-Spoiler
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-dismiss-hint"
                      id="btn-dismiss-hint"
                      onClick={() => {
                        setActiveHint(null);
                        setHintLevel(1);
                      }}
                      title="Close hint"
                      aria-label="Close hint"
                    >
                      ×
                    </button>
                  </div>

                  {/* Progressive Level Navigation Tabs */}
                  <div className="hint-level-tabs" role="tablist" aria-label="Hint Detail Levels">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={(activeHint.level || hintLevel) === 1}
                      className={`hint-level-tab ${(activeHint.level || hintLevel) === 1 ? 'active' : ''}`}
                      id="btn-hint-level-1"
                      onClick={() => handleSelectHintLevel(1)}
                      title="Level 1: General concept nudge"
                    >
                      1. Concept
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={(activeHint.level || hintLevel) === 2}
                      className={`hint-level-tab ${(activeHint.level || hintLevel) === 2 ? 'active' : ''}`}
                      id="btn-hint-level-2"
                      onClick={() => handleSelectHintLevel(2)}
                      title="Level 2: Focused operation guidance"
                    >
                      2. Focus
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={(activeHint.level || hintLevel) === 3}
                      className={`hint-level-tab ${(activeHint.level || hintLevel) === 3 ? 'active' : ''}`}
                      id="btn-hint-level-3"
                      onClick={() => handleSelectHintLevel(3)}
                      title="Level 3: Rule explanation & example"
                    >
                      3. Example
                    </button>
                  </div>

                  <div className="hint-card-body">
                    <p className="hint-message" id="step-hint-message">
                      {activeHint.hintText || activeHint.message}
                    </p>

                    {/* Level 2: Focus Subexpression Operation */}
                    {activeHint.targetSubexpression && (
                      <div className="hint-target-row" id="step-hint-target-row">
                        <span className="hint-target-label">Focus operation:</span>
                        <code className="hint-target-expr" id="step-hint-target">
                          {activeHint.targetSubexpression}
                        </code>
                      </div>
                    )}

                    {/* Level 3: Validated Parallel Example Card */}
                    {(activeHint.level || hintLevel) === 3 && activeHint.hasParallelExample && activeHint.parallelExample && (
                      <div className="hint-parallel-example-box" id="hint-parallel-example" aria-label="Parallel Example">
                        <div className="parallel-example-header">
                          <span className="parallel-example-icon">📖</span>
                          <span className="parallel-example-heading">Similar Example (Different Numbers):</span>
                        </div>
                        <div className="parallel-example-content">
                          <div className="parallel-example-line">
                            <span className="parallel-line-label">Expression:</span>
                            <code className="parallel-line-code" id="parallel-example-expr">
                              {activeHint.parallelExample.expression}
                            </code>
                          </div>
                          <div className="parallel-example-line">
                            <span className="parallel-line-label">First step:</span>
                            <span className="parallel-line-text" id="parallel-example-step">
                              {activeHint.parallelExample.firstStep}
                            </span>
                          </div>
                          <p className="parallel-example-note" id="parallel-example-note">
                            {activeHint.parallelExample.explanation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progressive Hint Navigation Controls */}
                  <div className="hint-card-footer">
                    {(activeHint.level || hintLevel) > 1 && (
                      <button
                        type="button"
                        className="btn-hint-nav btn-hint-prev"
                        id="btn-prev-hint-level"
                        onClick={handlePrevHintLevel}
                        title="Go back to previous hint level"
                      >
                        ⬅ Previous Level
                      </button>
                    )}
                    {(activeHint.level || hintLevel) < 3 && (
                      <button
                        type="button"
                        className="btn-hint-nav btn-hint-next"
                        id="btn-next-hint-level"
                        onClick={handleNextHintLevel}
                        title="Need more help? Go to next hint level"
                      >
                        {`Need more help? Level ${(activeHint.level || hintLevel) + 1} ➔`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Milestone 7.1 (Phase C): Step Completion Celebration Card */}
              {isCompleted ? (
                <div className="step-completion-card" id="step-completion-card" role="region" aria-label="Step Problem Completed">
                  <div className="completion-card-header">
                    <span className="completion-trophy">🏆</span>
                    <div className="completion-card-titles">
                      <h3 className="completion-title">Problem Solved!</h3>
                      <p className="completion-subtitle">
                        All operations reduced successfully across {stepHistoryList.length} verified step(s).
                      </p>
                    </div>
                  </div>
                  <div className="completion-result-row">
                    <span className="completion-label">Final Value:</span>
                    <code className="completion-value" id="step-final-value">
                      {stepHistoryList[stepHistoryList.length - 1]?.expression || workingExpressionString}
                    </code>
                  </div>
                  <div className="completion-actions-row">
                    <button
                      type="button"
                      className="btn-step-undo-final"
                      id="btn-step-undo-final"
                      onClick={handleUndoStep}
                      title="Step back to try another path"
                    >
                      ↩ Undo Last Step
                    </button>
                    <button
                      type="button"
                      className="btn-step-restart"
                      id="btn-step-restart-final"
                      onClick={handleRestartStepSequence}
                      title="Restart from the beginning"
                    >
                      ↺ Solve Again
                    </button>
                  </div>
                </div>
              ) : (
                /* 3. Step Expression Assembly Ribbon Card */
                <div className="step-assembly-card" id="step-assembly-card">
                  <div className="step-assembly-header">
                    <div className="step-header-title-group">
                      <span className="step-assembly-label">Your Next Step:</span>
                      <span className="step-token-count-pill" title="Tokens in step expression">
                        {`${stepTokenCount} ${stepTokenCount === 1 ? 'symbol' : 'symbols'}`}
                      </span>
                      <span className={`syntax-status-badge ${stepSyntaxStatus.className}`} id="step-syntax-badge">
                        {stepSyntaxStatus.badge}
                      </span>
                    </div>
                    <div className="step-assembly-actions">
                      <button
                        type="button"
                        className="btn-workspace-action btn-backspace"
                        onClick={handleStepBackspace}
                        disabled={stepTokenCount === 0}
                        title="Remove the last token in your step"
                        id="btn-step-backspace"
                      >
                        ⌫ Backspace
                      </button>
                      <button
                        type="button"
                        className="btn-workspace-action btn-clear-expr"
                        onClick={handleStepClear}
                        disabled={stepTokenCount === 0}
                        title="Clear your step expression"
                        id="btn-step-clear"
                      >
                        Clear Step
                      </button>
                    </div>
                  </div>

                  {/* Step Ribbon Container */}
                  <div className="step-ribbon-container">
                    <div className="expression-ribbon step-ribbon" role="region" aria-label="Step Expression Ribbon" id="step-ribbon">
                      {stepTokenCount === 0 ? (
                        <span className="ribbon-placeholder" id="step-ribbon-placeholder">
                          Click "Copy Current" above or use operators / digits below to assemble your next step...
                        </span>
                      ) : (
                        activeStepTokens.map((token, index) => {
                          const isOperator = token.type === 'operator';
                          const isParen = token.type === 'paren';

                          let chipClass = 'token-chip-digit';
                          if (isOperator) chipClass = 'token-chip-operator';
                          if (isParen) chipClass = 'token-chip-paren';

                          return (
                            <div
                              key={token.id || `step_tok_${token.value}_${index}`}
                              className={`token-chip ${chipClass}`}
                              title={`Step Token: ${token.display || token.value} (click × to remove)`}
                            >
                              <span className="token-chip-val">{token.display || token.value}</span>
                              <button
                                type="button"
                                className="token-chip-delete"
                                onClick={() => handleStepRemove(index)}
                                aria-label={`Remove ${token.display || token.value}`}
                                title="Remove this token"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Step Operator Strip (+, -, ×, ÷, (, )) */}
                  <div className="step-operator-strip-row" aria-label="Step Arithmetic Operators">
                    <span className="operator-strip-label">Operators:</span>
                    <div className="operator-buttons-group">
                      {OPERATOR_BUTTONS.map((op) => (
                        <button
                          key={`step_op_${op.label}`}
                          type="button"
                          className={`btn-operator-chip ${op.type === 'paren' ? 'btn-paren' : ''}`}
                          onClick={() => handleStepAppend(op.value, op.type)}
                          title={`Step ${op.title}`}
                          id={`btn-step-op-${op.value === '*' ? 'mul' : op.value === '/' ? 'div' : op.value === '(' ? 'lparen' : op.value === ')' ? 'rparen' : op.value === '+' ? 'plus' : 'minus'}`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step Digit Keypad (0–9) */}
                  <div className="step-digit-pad-row" aria-label="Step Digit Keypad">
                    <span className="digit-pad-label">Digits:</span>
                    <div className="answer-digit-pad step-digit-pad">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                        <button
                          key={`step_num_${num}`}
                          type="button"
                          className="btn-ans-digit"
                          onClick={() => handleStepAppend(String(num), 'digit')}
                          title={`Input ${num}`}
                          id={`btn-step-digit-${num}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step Live Syntax Readiness & Submission Controls Bar */}
                  <div className="step-submission-bar" id="step-submission-bar" aria-label="Step Readiness and Submission Controls">
                    <div className="syntax-status-indicator">
                      <span className="syntax-status-message" id="step-syntax-message">
                        {stepSyntaxStatus.message}
                      </span>
                    </div>

                    <div className="step-submission-actions">
                      <button
                        type="button"
                        className={`btn-step-hint ${activeHint ? 'active' : ''}`}
                        id="btn-step-hint"
                        onClick={handleToggleHint}
                        title={tokenCount === 0 ? 'Load a problem first' : 'Request an anti-spoiler hint for the next operation'}
                        disabled={tokenCount === 0}
                      >
                        {`💡 ${activeHint ? 'Hide Hint' : 'Hint'}`}
                      </button>
                      <button
                        type="button"
                        className="btn-check-step"
                        onClick={handleCheckStepAction}
                        disabled={!stepSyntaxStatus.isReady}
                        title={
                          !stepSyntaxStatus.isReady
                            ? 'Complete a valid step expression before checking'
                            : 'Check this simplification step'
                        }
                        id="btn-check-step"
                      >
                        <span className="btn-step-icon">👣</span>
                        <span>Check Step</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              DIRECT ANSWER MODE: Candidate Answer Buffer & Verifier Controls (M6.4)
              ========================================================================= */}
          {activePracticeSubMode === 'direct' && (
            <>
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
        </>
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
