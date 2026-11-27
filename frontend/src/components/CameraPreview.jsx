import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';
import { predictSymbol } from '../services/symbolRecognizer';
import { saveDatasetSample, syncDatasetCorpus } from '../services/api';
import ExpressionWorkspace from './ExpressionWorkspace';
import symbolModelV1 from '../assets/symbol_model_v1.json';
import symbolModelV2 from '../assets/symbol_model_v2.json';
import defaultCorpusSeed from '../assets/real_val_seed.json';

const SESSIONS = [
  { id: 'session_1', label: 'Session 1', split: 'Train', description: 'Session 1 (Training Split)' },
  { id: 'session_2', label: 'Session 2', split: 'Val', description: 'Session 2 (Validation Split)' },
  { id: 'session_3', label: 'Session 3', split: 'Test', description: 'Session 3 (Held-Out Test Split)' },
];

/**
 * CameraPreview Component (Milestone 3: Air-Writing Interaction)
 * Manages webcam acquisition via navigator.mediaDevices.getUserMedia(),
 * renders live video feed, provides start/stop controls, and integrates
 * real-time MediaPipe hand tracking, pinch gesture detection, and persistent
 * air-writing canvas drawing.
 */
export default function CameraPreview() {
  // Camera state: 'idle' | 'starting' | 'active' | 'error'
  const [cameraState, setCameraState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorType, setErrorType] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [videoResolution, setVideoResolution] = useState(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Milestone 4: Normalized Stroke Inspector State
  const [showInspector, setShowInspector] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [jsonViewTab, setJsonViewTab] = useState('normalized'); // 'normalized' | 'raw' | 'dataset'
  const normalizedCanvasRef = useRef(null);

  // Milestone 5: Local Symbol Recognition & Dataset Collection State
  const [corpus, setCorpus] = useState(() => {
    try {
      const saved = localStorage.getItem('aerosolve_airwriting_corpus');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load airwriting corpus from localStorage:', e);
    }
    return defaultCorpusSeed || [];
  });
  const [corpusNotice, setCorpusNotice] = useState(null);
  const [corpusEvaluation, setCorpusEvaluation] = useState(null);
  const [currentSession, setCurrentSession] = useState('session_1');
  const fileInputRef = useRef(null);

  // Milestone 3 & 4: Hand Tracking, Air-Writing, and Stroke Processing Hook
  const {
    canvasRef,
    drawingCanvasRef,
    modelState,
    modelError,
    drawingState,
    strokeCount,
    trackingInfo,
    loadModel,
    clearWriting,
    processedData,
    renderMode,
    setRenderMode,
    captureMode,
    setCaptureMode,
    rejectionCounters,
    resetDiagnosticCounters,
  } = useHandTracking({
    videoRef,
    cameraActive: cameraState === 'active',
    showSkeleton,
    showDiagnostics,
  });

  // Milestone 4: Render normalized unit-box strokes on inspector canvas
  useEffect(() => {
    if (!showInspector || !normalizedCanvasRef.current) return;
    const canvas = normalizedCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Grid lines at 25%, 50%, 75%
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let p = 0.25; p < 1.0; p += 0.25) {
      ctx.beginPath();
      ctx.moveTo(p * width, 0);
      ctx.lineTo(p * width, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p * height);
      ctx.lineTo(width, p * height);
      ctx.stroke();
    }

    // Outer unit box outline [0, 1] x [0, 1]
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Bounding Box of normalized strokes
    const bbox = processedData?.normalizedBoundingBox || processedData?.boundingBox;
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        bbox.minX * width,
        bbox.minY * height,
        bbox.width * width,
        bbox.height * height
      );
      ctx.setLineDash([]);
    }

    // Colors for stroke order
    const STROKE_COLORS = ['#38bdf8', '#c084fc', '#fbbf24', '#34d399', '#f43f5e', '#a78bfa'];

    const strokes = processedData?.strokes || [];
    strokes.forEach((stroke, strokeIdx) => {
      if (!stroke || stroke.length === 0) return;
      const color = STROKE_COLORS[strokeIdx % STROKE_COLORS.length];

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.moveTo(stroke[0].x * width, stroke[0].y * height);
      if (stroke.length === 1) {
        ctx.arc(stroke[0].x * width, stroke[0].y * height, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x * width, stroke[i].y * height);
        }
        ctx.stroke();
      }
      ctx.restore();

      // Draw resampled points and start/end markers
      ctx.save();
      for (let i = 0; i < stroke.length; i++) {
        const pt = stroke[i];
        ctx.beginPath();
        if (i === 0) {
          ctx.fillStyle = '#34d399'; // Start: green
          ctx.arc(pt.x * width, pt.y * height, 4.5, 0, 2 * Math.PI);
        } else if (i === stroke.length - 1) {
          ctx.fillStyle = '#f87171'; // End: red
          ctx.arc(pt.x * width, pt.y * height, 4.5, 0, 2 * Math.PI);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.arc(pt.x * width, pt.y * height, 2.0, 0, 2 * Math.PI);
        }
        ctx.fill();
      }
      ctx.restore();
    });
  }, [showInspector, processedData]);

  // Phase 6: Reversible Model Selection State (V1 Production Baseline vs V2 Candidate Retrained)
  const [selectedModelVersion, setSelectedModelVersion] = useState(() => {
    try {
      return localStorage.getItem('aerosolve_selected_model') || 'v1';
    } catch {
      return 'v1';
    }
  });

  const activeModel = useMemo(() => {
    return selectedModelVersion === 'v1' ? symbolModelV1 : symbolModelV2;
  }, [selectedModelVersion]);

  const handleModelVersionChange = useCallback((ver) => {
    setSelectedModelVersion(ver);
    try {
      localStorage.setItem('aerosolve_selected_model', ver);
    } catch (e) {
      console.warn('Failed to save selected model version:', e);
    }
  }, []);

  // Phase 6: Human Validation Trial Recorder State (Strictly Segregated from Training Corpus)
  const [validationLog, setValidationLog] = useState(() => {
    try {
      const saved = localStorage.getItem('aerosolve_phase6_validation_log');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load validation log:', e);
    }
    return [];
  });
  const [validationToast, setValidationToast] = useState(null);
  const [showValidationSummary, setShowValidationSummary] = useState(false);

  // Phase B: Multi-stroke completion delay & classification state
  const [debouncedRecognition, setDebouncedRecognition] = useState(null);
  const [isStrokePending, setIsStrokePending] = useState(false);
  const [debounceDelayMs] = useState(450); // 450ms default (configurable)
  const debounceTimerRef = useRef(null);
  const prevPinchRef = useRef(false);

  // Monitor pinch transitions and stroke changes to manage multi-stroke debounce
  useEffect(() => {
    const isPinching = trackingInfo?.isPinching || drawingState === 'drawing';

    if (isPinching) {
      // User is actively drawing a stroke: cancel any pending classification timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsStrokePending(true);
    } else if (prevPinchRef.current && !isPinching && strokeCount > 0) {
      // User just released pinch (stroke finished): start multi-stroke completion timer
      setIsStrokePending(true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        setIsStrokePending(false);
        if (processedData && processedData.strokes && processedData.strokes.length > 0) {
          const qualificationOpts = {
            aspectRatio: processedData.aspectRatio,
            strokeCount: processedData.strokeCount,
            pointCountRaw: processedData.pointCountRaw,
            rawArcLength: processedData.rawArcLength,
            boundingBox: processedData.boundingBox,
            rawBoundingBox: processedData.rawBoundingBox || processedData.boundingBox,
            rawStrokes: processedData.rawStrokes,
          };
          const resActive = predictSymbol(processedData.strokes, activeModel, qualificationOpts);
          const resV1 = predictSymbol(processedData.strokes, symbolModelV1, qualificationOpts);
          const resV2 = predictSymbol(processedData.strokes, symbolModelV2, qualificationOpts);
          setDebouncedRecognition({
            ...resActive,
            activeVersion: selectedModelVersion,
            comparison: { v1: resV1, v2: resV2 },
          });
        }
      }, debounceDelayMs);
    } else if (strokeCount === 0) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsStrokePending(false);
      setDebouncedRecognition(null);
    }

    prevPinchRef.current = isPinching;
  }, [trackingInfo?.isPinching, drawingState, strokeCount, processedData, activeModel, selectedModelVersion, debounceDelayMs]);

  // Phase 6: Instantly re-evaluate displayed stroke if active model is switched
  useEffect(() => {
    if (strokeCount > 0 && processedData && processedData.strokes && processedData.strokes.length > 0 && !isStrokePending) {
      const qualificationOpts = {
        aspectRatio: processedData.aspectRatio,
        strokeCount: processedData.strokeCount,
        pointCountRaw: processedData.pointCountRaw,
        rawArcLength: processedData.rawArcLength,
        boundingBox: processedData.boundingBox,
        rawBoundingBox: processedData.rawBoundingBox || processedData.boundingBox,
        rawStrokes: processedData.rawStrokes,
      };
      const resActive = predictSymbol(processedData.strokes, activeModel, qualificationOpts);
      const resV1 = predictSymbol(processedData.strokes, symbolModelV1, qualificationOpts);
      const resV2 = predictSymbol(processedData.strokes, symbolModelV2, qualificationOpts);
      setDebouncedRecognition({
        ...resActive,
        activeVersion: selectedModelVersion,
        comparison: { v1: resV1, v2: resV2 },
      });
    }
  }, [selectedModelVersion, activeModel, processedData, strokeCount, isStrokePending]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const recognitionResult = debouncedRecognition;

  // Milestone 6.4 (Phases A & C): Expression Assembly & Practice Mode State
  const [expressionTokens, setExpressionTokens] = useState([]);
  const [workspaceMode, setWorkspaceMode] = useState('solver');
  const [answerDigits, setAnswerDigits] = useState([]);
  const [answerSign, setAnswerSign] = useState('+');

  const handleAppendToken = useCallback((value, type = 'digit') => {
    if (!value) return;
    const displayMap = { '*': '×', '/': '÷' };
    const newToken = {
      id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      value: String(value),
      display: displayMap[value] || String(value),
    };
    setExpressionTokens((prev) => [...prev, newToken]);
    // Clear canvas when a recognized digit is committed to expression
    if (type === 'digit') {
      clearWriting();
    }
  }, [clearWriting]);

  const handleRemoveToken = useCallback((index) => {
    setExpressionTokens((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleBackspaceToken = useCallback(() => {
    setExpressionTokens((prev) => prev.slice(0, -1));
  }, []);

  const handleClearExpression = useCallback(() => {
    setExpressionTokens([]);
  }, []);

  // Milestone 6.4 (Phase C): Candidate Answer Buffer Handlers
  const handleAppendAnswerDigit = useCallback((digit) => {
    if (digit === null || digit === undefined) return;
    setAnswerDigits((prev) => [...prev, String(digit)]);
    clearWriting();
  }, [clearWriting]);

  const handleBackspaceAnswer = useCallback(() => {
    setAnswerDigits((prev) => prev.slice(0, -1));
  }, []);

  const handleClearAnswer = useCallback(() => {
    setAnswerDigits([]);
  }, []);

  const handleToggleAnswerSign = useCallback(() => {
    setAnswerSign((prev) => (prev === '+' ? '-' : '+'));
  }, []);

  const handleAddAnswerDecimal = useCallback(() => {
    setAnswerDigits((prev) => {
      if (prev.includes('.')) return prev;
      if (prev.length === 0) return ['0', '.'];
      return [...prev, '.'];
    });
  }, []);

  // Milestone 5: Corpus statistics per digit (differentiating genuine webcam samples from seeds and session counts)
  const corpusStats = useMemo(() => {
    const counts = {};
    for (let i = 0; i < 10; i++) counts[String(i)] = 0;
    let genuineCount = 0;
    let seedCount = 0;
    const sessionCounts = { session_1: 0, session_2: 0, session_3: 0 };

    corpus.forEach((item) => {
      const lbl = String(item.label);
      if (counts[lbl] !== undefined) counts[lbl]++;
      if (item.is_synthetic) {
        seedCount++;
      } else {
        genuineCount++;
      }
      if (item.session_id && sessionCounts[item.session_id] !== undefined) {
        sessionCounts[item.session_id]++;
      }
    });
    return { perDigit: counts, total: corpus.length, genuineCount, seedCount, sessionCounts };
  }, [corpus]);

  // Milestone 5: Save currently drawn sample to corpus & automatically clear canvas for next sample
  const handleSaveSample = useCallback((label) => {
    if (!processedData || !processedData.strokes || processedData.strokes.length === 0) {
      setCorpusNotice('No strokes drawn to save.');
      setTimeout(() => setCorpusNotice(null), 2500);
      return;
    }

    const newSample = {
      id: `real_airwriting_${label}_${Date.now()}`,
      label: String(label),
      digit: parseInt(label, 10),
      strokes: processedData.strokes,
      stroke_count: processedData.strokeCount,
      aspect_ratio: processedData.aspectRatio,
      point_count: processedData.pointCountProcessed,
      created_at: new Date().toISOString(),
      is_synthetic: false,
      capture_source: 'webcam_m4_pipeline',
      session_id: currentSession,
    };

    setCorpus((prev) => {
      const updated = [...prev, newSample];
      try {
        localStorage.setItem('aerosolve_airwriting_corpus', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }
      return updated;
    });

    // Asynchronously sync to backend storage
    saveDatasetSample(newSample).catch(() => {});

    const sessionObj = SESSIONS.find((s) => s.id === currentSession);
    const sessionName = sessionObj ? `${sessionObj.label} (${sessionObj.split})` : currentSession;
    setCorpusNotice(`Saved digit "${label}" into ${sessionName}! (Total: ${corpus.length + 1})`);
    setTimeout(() => setCorpusNotice(null), 2500);

    // Auto-clear canvas for seamless rapid air-writing collection
    clearWriting();
  }, [processedData, corpus.length, currentSession, clearWriting]);

  // Milestone 5: Keyboard shortcut (0-9) to quickly tag & save drawn stroke
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        if (processedData && processedData.strokes && processedData.strokes.length > 0) {
          e.preventDefault();
          handleSaveSample(e.key);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processedData, handleSaveSample]);

  // Milestone 5: Export full corpus as formatted JSON file
  const handleExportCorpus = useCallback(() => {
    const blob = new Blob([JSON.stringify(corpus, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aerosolve_airwriting_corpus_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [corpus]);

  // Milestone 5: Synchronize all samples with backend data directory
  const handleSyncToBackend = useCallback(async () => {
    if (corpus.length === 0) {
      setCorpusNotice('No samples to sync.');
      setTimeout(() => setCorpusNotice(null), 2500);
      return;
    }
    const res = await syncDatasetCorpus(corpus);
    if (res.success) {
      setCorpusNotice(`Successfully synced ${corpus.length} samples to backend storage!`);
    } else {
      setCorpusNotice(`Sync failed: ${res.error || 'Server error'}`);
    }
    setTimeout(() => setCorpusNotice(null), 3000);
  }, [corpus]);

  // Milestone 5: Import corpus from user-uploaded JSON file
  const handleImportCorpus = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (Array.isArray(parsed)) {
          setCorpus(parsed);
          localStorage.setItem('aerosolve_airwriting_corpus', JSON.stringify(parsed));
          setCorpusNotice(`Imported ${parsed.length} samples into corpus!`);
          setTimeout(() => setCorpusNotice(null), 3000);
        } else {
          setCorpusNotice('Invalid corpus file format (expected JSON array).');
          setTimeout(() => setCorpusNotice(null), 3000);
        }
      } catch {
        setCorpusNotice('Failed to parse JSON file.');
        setTimeout(() => setCorpusNotice(null), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // Milestone 5: Evaluate current model against all samples in corpus
  const handleEvaluateCorpus = useCallback(() => {
    if (corpus.length === 0) return;
    let correctTop1 = 0;
    let correctTop3 = 0;
    const perDigit = {};
    for (let i = 0; i < 10; i++) {
      perDigit[String(i)] = { correct: 0, total: 0 };
    }

    corpus.forEach((item) => {
      const lbl = String(item.label);
      if (perDigit[lbl]) perDigit[lbl].total++;
      const res = predictSymbol(item.strokes, activeModel, {
        aspectRatio: item.aspect_ratio,
        strokeCount: item.stroke_count,
      });
      if (res.topPrediction === lbl) {
        correctTop1++;
        if (perDigit[lbl]) perDigit[lbl].correct++;
      }
      if (res.candidates.some((c) => c.label === lbl)) {
        correctTop3++;
      }
    });

    setCorpusEvaluation({
      total: corpus.length,
      top1Accuracy: Number((correctTop1 / corpus.length).toFixed(4)),
      top3Accuracy: Number((correctTop3 / corpus.length).toFixed(4)),
      perDigit,
      evaluatedModelVersion: selectedModelVersion,
    });
  }, [corpus, activeModel, selectedModelVersion]);

  // Phase 6: Record human validation trial (strictly segregated from training corpus)
  const handleRecordValidationTrial = useCallback((intendedDigit) => {
    if (!debouncedRecognition?.comparison) return;
    const { v1, v2 } = debouncedRecognition.comparison;
    const intendedStr = String(intendedDigit);

    const newRecord = {
      trial: validationLog.length + 1,
      timestamp: new Date().toISOString(),
      intended: intendedStr,
      activeModel: selectedModelVersion,
      v1: {
        prediction: v1.topPrediction || null,
        confidence: v1.confidence || 0,
        status: v1.status,
        isCorrect: v1.status === 'ACCEPTED' && v1.topPrediction === intendedStr,
        isUncertain: v1.status === 'UNCERTAIN',
      },
      v2: {
        prediction: v2.topPrediction || null,
        confidence: v2.confidence || 0,
        status: v2.status,
        isCorrect: v2.status === 'ACCEPTED' && v2.topPrediction === intendedStr,
        isUncertain: v2.status === 'UNCERTAIN',
      },
    };

    const updated = [...validationLog, newRecord];
    setValidationLog(updated);
    try {
      localStorage.setItem('aerosolve_phase6_validation_log', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save validation log:', e);
    }

    const v1Text = newRecord.v1.isCorrect ? '✓ V1' : `✗ V1 (${newRecord.v1.prediction || newRecord.v1.status})`;
    const v2Text = newRecord.v2.isCorrect ? '✓ V2' : `✗ V2 (${newRecord.v2.prediction || newRecord.v2.status})`;
    setValidationToast(`Trial #${newRecord.trial} logged for "${intendedStr}" [${v1Text} | ${v2Text}]`);
    setTimeout(() => setValidationToast(null), 3000);

    // Auto-clear canvas for next air-writing trial
    clearWriting();
  }, [debouncedRecognition, validationLog, selectedModelVersion, clearWriting]);

  // Phase 6: Live summary stats for manual human validation trials
  const validationStats = useMemo(() => {
    if (validationLog.length === 0) return null;
    const total = validationLog.length;
    let v1Correct = 0;
    let v2Correct = 0;
    let v1Uncertain = 0;
    let v2Uncertain = 0;
    const perDigit = {};
    for (let d = 0; d < 10; d++) {
      perDigit[String(d)] = {
        trials: 0,
        v1Correct: 0,
        v2Correct: 0,
        v1Confusions: {},
        v2Confusions: {},
      };
    }

    validationLog.forEach((t) => {
      if (t.v1.isCorrect) v1Correct++;
      if (t.v2.isCorrect) v2Correct++;
      if (t.v1.isUncertain) v1Uncertain++;
      if (t.v2.isUncertain) v2Uncertain++;

      const item = perDigit[t.intended];
      if (item) {
        item.trials++;
        if (t.v1.isCorrect) {
          item.v1Correct++;
        } else {
          const p = t.v1.prediction || t.v1.status;
          item.v1Confusions[p] = (item.v1Confusions[p] || 0) + 1;
        }
        if (t.v2.isCorrect) {
          item.v2Correct++;
        } else {
          const p = t.v2.prediction || t.v2.status;
          item.v2Confusions[p] = (item.v2Confusions[p] || 0) + 1;
        }
      }
    });

    return {
      total,
      v1Correct,
      v1Accuracy: Number(((v1Correct / total) * 100).toFixed(1)),
      v1Uncertain,
      v2Correct,
      v2Accuracy: Number(((v2Correct / total) * 100).toFixed(1)),
      v2Uncertain,
      perDigit,
    };
  }, [validationLog]);

  const handleClearValidationLog = useCallback(() => {
    if (window.confirm('Clear all recorded Phase 6 human validation trials?')) {
      setValidationLog([]);
      try {
        localStorage.removeItem('aerosolve_phase6_validation_log');
      } catch (e) {
        console.warn('Failed to clear validation log:', e);
      }
      setValidationToast('Validation trials cleared.');
      setTimeout(() => setValidationToast(null), 2500);
    }
  }, []);

  const handleExportValidationLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(validationLog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aerosolve_phase6_human_validation_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [validationLog]);

  // Milestone 5: Clear collected corpus
  const handleClearCorpus = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all collected air-writing samples?')) {
      setCorpus([]);
      localStorage.setItem('aerosolve_airwriting_corpus', '[]');
      setCorpusEvaluation(null);
      setCorpusNotice('Corpus cleared.');
      setTimeout(() => setCorpusNotice(null), 2500);
    }
  }, []);

  /**
   * Helper to stop all active media tracks and clear video source.
   */
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping media track:', e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  /**
   * Stop camera feed and reset state to idle.
   * Note: Completed air-writing strokes are preserved!
   */
  const stopCamera = useCallback(() => {
    stopTracks();
    setCameraState('idle');
    setErrorMessage('');
    setErrorType('');
    setDeviceLabel('');
    setVideoResolution(null);
  }, [stopTracks]);

  /**
   * Start camera feed by requesting user media.
   * Invoked ONLY on explicit user action (button click).
   */
  const startCamera = async () => {
    stopTracks();
    setErrorMessage('');
    setErrorType('');
    setCameraState('starting');

    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraState('error');
      setErrorType('UnsupportedBrowser');
      setErrorMessage(
        'Webcam access is not supported by your browser or environment. Please use an updated modern browser (Chrome, Edge, Firefox, Safari) over HTTPS or localhost.'
      );
      return;
    }

    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current
              .play()
              .then(() => {
                setCameraState('active');
                setVideoResolution({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight,
                });
              })
              .catch((playErr) => {
                console.error('Video play error:', playErr);
                setCameraState('error');
                setErrorType('PlayError');
                setErrorMessage('Unable to start video playback. Please try again.');
              });
          }
        };

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          setDeviceLabel(videoTrack.label || 'Webcam Active');

          videoTrack.onended = () => {
            stopCamera();
          };
        }
      }
    } catch (err) {
      console.error('Camera startup error:', err);
      stopTracks();
      setCameraState('error');

      switch (err.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setErrorType('PermissionDenied');
          setErrorMessage(
            'Camera permission was denied. Please allow camera access in your browser settings and click "Start Camera" again.'
          );
          break;

        case 'NotFoundError':
        case 'DevicesNotFoundError':
          setErrorType('NotFound');
          setErrorMessage(
            'No camera hardware detected. Please plug in or enable a webcam device and try again.'
          );
          break;

        case 'NotReadableError':
        case 'TrackStartError':
          setErrorType('NotReadable');
          setErrorMessage(
            'The camera is currently busy or being used by another application. Please close other apps and try again.'
          );
          break;

        case 'OverconstrainedError':
          setErrorType('Overconstrained');
          setErrorMessage(
            'The requested camera resolution or settings are not supported by your hardware.'
          );
          break;

        case 'SecurityError':
          setErrorType('Security');
          setErrorMessage(
            'Camera access was blocked due to security policies. Ensure you are accessing via http://localhost or HTTPS.'
          );
          break;

        default:
          setErrorType('Unknown');
          setErrorMessage(
            err.message || 'An unknown error occurred while trying to initialize the camera.'
          );
          break;
      }
    }
  };

  /**
   * Cleanup on unmount: stop all active tracks.
   */
  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  return (
    <section className="camera-section" aria-label="Webcam Preview and Air-Writing Controls">
      <div className="camera-viewport-card">
        {/* Top Status & Controls Toolbar */}
        <div className="camera-toolbar">
          <div className="camera-info-group">
            <span className="camera-title">Live Air-Writing Workspace</span>
            {cameraState === 'active' && deviceLabel && (
              <span className="device-tag" title={deviceLabel}>
                {deviceLabel}
              </span>
            )}
          </div>

          {/* Active Data Collection Session Selector */}
          <div className="workspace-session-selector" role="group" aria-label="Active Data Collection Session">
            <span className="session-selector-title">Collection Target:</span>
            <div className="session-pill-buttons">
              {SESSIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`btn-session-chip ${currentSession === s.id ? 'active' : ''}`}
                  onClick={() => setCurrentSession(s.id)}
                  title={`Switch active air-writing data collection target to ${s.description}`}
                  id={`btn-session-header-${s.id}`}
                >
                  <span className={`session-indicator-dot ${currentSession === s.id ? 'active-dot' : ''}`}></span>
                  <span className="session-chip-name">{s.label}</span>
                  <span className="session-chip-split">{s.split}</span>
                  {corpusStats.sessionCounts[s.id] > 0 && (
                    <span className="session-chip-count">{corpusStats.sessionCounts[s.id]}</span>
                  )}
                  {currentSession === s.id && <span className="session-chip-check">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="camera-status-badge-container">
            {/* Camera Status Badge */}
            {cameraState === 'idle' && (
              <span className="status-badge badge-idle">
                <span className="status-indicator-dot dot-idle"></span>
                Camera Inactive
              </span>
            )}
            {cameraState === 'starting' && (
              <span className="status-badge badge-starting">
                <span className="mini-spinner" aria-hidden="true"></span>
                Camera Starting...
              </span>
            )}
            {cameraState === 'active' && (
              <span className="status-badge badge-active">
                <span className="status-indicator-dot dot-live-pulse"></span>
                Camera Live
              </span>
            )}
            {cameraState === 'error' && (
              <span className="status-badge badge-error">
                <span className="status-indicator-dot dot-error"></span>
                Camera Error
              </span>
            )}

            {/* MediaPipe Model Status Badge */}
            {modelState === 'loading' && (
              <span className="status-badge badge-starting" title="Loading MediaPipe Hand Landmarker model">
                <span className="mini-spinner" aria-hidden="true"></span>
                Loading Model...
              </span>
            )}
            {modelState === 'error' && (
              <span className="status-badge badge-error" title={modelError}>
                <span className="status-indicator-dot dot-error"></span>
                Model Error
              </span>
            )}

            {/* Milestone 3: Air-Writing Drawing Status Badge */}
            {modelState === 'ready' && cameraState === 'active' && (
              <>
                {drawingState === 'no_hand' && (
                  <span className="status-badge badge-idle" title="No hand detected in camera frame">
                    <span className="status-indicator-dot dot-idle"></span>
                    Hand Not Detected
                  </span>
                )}
                {drawingState === 'ready' && (
                  <span className="status-badge badge-ready" title="Hand detected! Pinch index finger and thumb to write.">
                    <span className="status-indicator-dot dot-ready"></span>
                    Ready (Pinch to Write)
                  </span>
                )}
                {drawingState === 'drawing' && (
                  <span className="status-badge badge-drawing" title="Pinch active! Air-writing in progress.">
                    <span className="status-indicator-dot dot-drawing-pulse"></span>
                    ● Drawing
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Video, Drawing Canvas & Tracking Canvas Viewport */}
        <div
          className="video-container"
          style={{
            aspectRatio: videoResolution ? `${videoResolution.width} / ${videoResolution.height}` : '16 / 9',
          }}
        >
          {/* Layer 1: Native HTML5 Video Element */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`camera-video-element ${cameraState === 'active' ? 'visible' : 'hidden'}`}
            aria-label="Webcam feed"
          />

          {/* Layer 2: Persistent Air-Writing Ink Canvas (Milestone 3) */}
          <canvas
            ref={drawingCanvasRef}
            className="air-writing-canvas visible"
            aria-label="Air-writing drawing layer"
          />

          {/* Layer 3: Ephemeral Tracking Reticle & Skeleton Overlay Canvas */}
          <canvas
            ref={canvasRef}
            className={`tracking-overlay-canvas ${cameraState === 'active' ? 'visible' : 'hidden'}`}
            aria-hidden="true"
          />

          {/* Idle Placeholder */}
          {cameraState === 'idle' && (
            <div className="camera-placeholder idle-placeholder">
              <div className="placeholder-icon-wrap">
                <svg
                  className="camera-icon-large"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <h3 className="placeholder-heading">Camera is Inactive</h3>
              <p className="placeholder-subtext">
                Click <strong>"Start Camera"</strong> below to grant webcam permission, track your hand, and begin air-writing.
              </p>
              <div className="privacy-callout">
                <svg
                  className="shield-icon"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Air-writing and MediaPipe run locally in your browser. No video is recorded or uploaded.</span>
              </div>
            </div>
          )}

          {/* Starting / Loading Overlay */}
          {cameraState === 'starting' && (
            <div className="camera-placeholder starting-placeholder" aria-live="polite">
              <div className="loading-spinner-ring"></div>
              <h3 className="placeholder-heading">Starting Camera...</h3>
              <p className="placeholder-subtext">
                Requesting camera access. Please approve the browser prompt if prompted.
              </p>
            </div>
          )}

          {/* Camera Error Message Overlay */}
          {cameraState === 'error' && (
            <div className="camera-placeholder error-placeholder" role="alert">
              <div className="error-icon-wrap">
                <svg
                  className="error-icon-large"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 className="error-heading">Camera Unavailable</h3>
              <p className="error-description">{errorMessage}</p>
              {errorType === 'PermissionDenied' && (
                <div className="error-tip">
                  <strong>How to fix:</strong> Click the camera icon in your browser URL bar, change Camera to <em>Allow</em>, and click "Start Camera" again.
                </div>
              )}
            </div>
          )}

          {/* Live Stream Overlay Metadata */}
          {cameraState === 'active' && videoResolution && (
            <div className="live-overlay-tag">
              <span>● AIR-WRITING ACTIVE</span>
              <span>{videoResolution.width} × {videoResolution.height}</span>
              {trackingInfo.fps > 0 && <span>• {trackingInfo.fps} FPS</span>}
              {strokeCount > 0 && <span className="stroke-pill">{strokeCount} {strokeCount === 1 ? 'stroke' : 'strokes'}</span>}
            </div>
          )}
        </div>

        {/* Action Controls & Settings */}
        <div className="camera-actions-bar">
          <div className="actions-controls-wrapper">
            {/* Primary Action Controls */}
            <div className="button-group camera-btn-group">
              <button
                onClick={startCamera}
                disabled={cameraState === 'active' || cameraState === 'starting'}
                className="btn btn-primary btn-start"
                id="btn-start-camera"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Start Camera
              </button>

              <button
                onClick={stopCamera}
                disabled={cameraState === 'idle' || cameraState === 'starting'}
                className="btn btn-secondary btn-stop"
                id="btn-stop-camera"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop Camera
              </button>

              {/* Milestone 3: Clear Writing Button */}
              <button
                onClick={clearWriting}
                disabled={strokeCount === 0}
                className="btn btn-clear-writing"
                id="btn-clear-writing"
                title="Clear all air-writing strokes from the canvas"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                Clear Writing {strokeCount > 0 ? `(${strokeCount})` : ''}
              </button>
            </div>

            {/* View & Telemetry Toggles */}
            <div className="button-group toggles-btn-group">
              <button
                onClick={() => setShowSkeleton((prev) => !prev)}
                disabled={cameraState !== 'active'}
                className={`btn btn-toggle-skeleton ${showSkeleton ? 'active' : ''}`}
                title="Toggle 21 hand landmarks and skeleton connections"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M6 14v-2a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6a7 7 0 0 0 7 7h1a7 7 0 0 0 7-7v-3a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2" />
                </svg>
                {showSkeleton ? 'Hide Skeleton' : 'Show Skeleton'}
              </button>

              <button
                onClick={() => setShowDiagnostics((prev) => !prev)}
                disabled={cameraState !== 'active'}
                className={`btn btn-toggle-diag ${showDiagnostics ? 'active' : ''}`}
                title="Toggle live telemetry & tracking dropout diagnostics HUD"
                id="btn-toggle-diagnostics"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                {showDiagnostics ? 'Hide HUD' : 'Diagnostics HUD'}
              </button>
            </div>

            {/* Diagnostic Capture Mode: Pinch Air-Writing vs Continuous Tracer */}
            <div className="button-group modes-btn-group">
              <div className="capture-mode-group" role="group" aria-label="Tracking Capture Mode">
                <span className="mode-label">Capture:</span>
                <button
                  type="button"
                  className={`btn-mode-pill ${captureMode === 'pinch' ? 'active' : ''}`}
                  onClick={() => setCaptureMode('pinch')}
                  title="Pinch air-writing: Pinch index finger and thumb to write"
                  id="btn-capture-pinch"
                >
                  Pinch Air-Writing
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill pill-tracer ${captureMode === 'continuous' ? 'active active-tracer' : ''}`}
                  onClick={() => setCaptureMode('continuous')}
                  title="Continuous Tracer: Continuously tracks and renders index fingertip without pinch logic"
                  id="btn-capture-tracer"
                >
                  Continuous Tracer
                </button>
              </div>

              {/* Milestone 4: Render Mode Selector (Raw / Processed / Compare) */}
              <div className="render-mode-group" role="group" aria-label="Stroke Render Mode">
                <span className="mode-label">Mode:</span>
                <button
                  type="button"
                  className={`btn-mode-pill ${renderMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setRenderMode('raw')}
                  title="Display raw unmodified air-writing strokes"
                  id="btn-mode-raw"
                >
                  Raw
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill ${renderMode === 'processed' ? 'active' : ''}`}
                  onClick={() => setRenderMode('processed')}
                  title="Display smoothed and resampled ink strokes"
                  id="btn-mode-processed"
                >
                  Processed
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill ${renderMode === 'comparison' ? 'active' : ''}`}
                  onClick={() => setRenderMode('comparison')}
                  title="Compare raw (faint dashed) vs processed (solid cyan with nodes)"
                  id="btn-mode-compare"
                >
                  Compare
                </button>
              </div>
            </div>

            {/* Milestone 4/5: Toggle Stroke Normalization Inspector & Dataset Collector */}
            <div className="button-group inspector-btn-group">
              <button
                onClick={() => setShowInspector((prev) => !prev)}
                className={`btn btn-toggle-inspector ${showInspector ? 'active' : ''}`}
                title="Inspect M4 normalized stroke geometry and M5 dataset collection"
                id="btn-inspect-strokes"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                </svg>
                Inspect M4 / Dataset ({corpusStats.total})
              </button>
            </div>
          </div>

          <div className="action-hint">
            {modelState === 'error' && (
              <button onClick={loadModel} className="btn-retry-model">
                Retry Model Load
              </button>
            )}
            {cameraState === 'active' && drawingState === 'drawing' && (
              <span className="hint-text drawing-hint">
                Pinch held — drawing stroke with index finger. Release pinch to finish stroke.
              </span>
            )}
            {cameraState === 'active' && drawingState === 'ready' && (
              <span className="hint-text ready-hint">
                Pinch your index finger and thumb together to write.
              </span>
            )}
            {cameraState === 'active' && drawingState === 'no_hand' && (
              <span className="hint-text">
                Bring your hand into view to activate air-writing.
              </span>
            )}
            {cameraState === 'idle' && (
              <span className="hint-text">
                Webcam is offline. Click Start Camera to begin air-writing.
              </span>
            )}
          </div>
        </div>

        {/* Phase 6: Active Model Selection Bar */}
        <div className="model-selection-bar" aria-label="Model Selection Controls">
          <div className="model-selection-group">
            <span className="model-selection-label">Recognition Model:</span>
            <button
              type="button"
              className={`btn-model-select ${selectedModelVersion === 'v1' ? 'active-v1' : ''}`}
              onClick={() => handleModelVersionChange('v1')}
              title="Select Production Baseline Model (V1 - Old Corpus)"
              id="btn-model-v1"
            >
              <span className="model-badge">V1</span> Production Baseline
            </button>
            <button
              type="button"
              className={`btn-model-select ${selectedModelVersion === 'v2' ? 'active-v2' : ''}`}
              onClick={() => handleModelVersionChange('v2')}
              title="Select Candidate Retrained Model (V2 - Digit 8 Fixed)"
              id="btn-model-v2"
            >
              <span className="model-badge">V2</span> Candidate (Retrained)
            </button>
          </div>
          <div className="model-selection-meta">
            <span className="model-active-indicator">
              Active: <strong className={selectedModelVersion === 'v2' ? 'text-v2' : 'text-v1'}>
                {selectedModelVersion === 'v2' ? 'Model V2 (Candidate)' : 'Model V1 (Production)'}
              </strong>
            </span>
            {validationLog.length > 0 && (
              <button
                type="button"
                className="btn-toggle-val-summary"
                onClick={() => setShowValidationSummary((prev) => !prev)}
                title="Toggle Phase 6 Human Validation Summary"
              >
                Validation Trials: {validationLog.length} {showValidationSummary ? '▲' : '▼'}
              </button>
            )}
          </div>
        </div>

        {/* Milestone 5: Local Symbol Recognition Card */}
        {strokeCount > 0 && (isStrokePending || recognitionResult) && (
          <div className="recognition-card" aria-label="Milestone 5 Local Symbol Recognition Card">
            <div className="recognition-main">
              {isStrokePending ? (
                <>
                  <div className="recognition-badge-wrap">
                    <span className="recognition-label">Composing</span>
                    <span className="recognition-digit stroke-pending">⏳</span>
                  </div>
                  <div className="recognition-details">
                    <div className="recognition-confidence-row">
                      <span className="recognition-score-title">Multi-Stroke Debounce:</span>
                      <span className="recognition-status-pill pill-cyan">
                        Stroke {strokeCount} finished...
                      </span>
                      <span className="recognition-latency-badge">⏱ {debounceDelayMs}ms window</span>
                    </div>
                    <div className="recognition-candidates-row">
                      <span className="candidates-label">Status:</span>
                      <span className="candidate-pill">Draw next stroke or pause to complete</span>
                    </div>
                  </div>
                </>
              ) : recognitionResult?.status === 'REJECTED' ? (
                <>
                  <div className="recognition-badge-wrap">
                    <span className="recognition-label">Status</span>
                    <span className="recognition-digit digit-rejected">•</span>
                  </div>
                  <div className="recognition-details">
                    <div className="recognition-confidence-row">
                      <span className="recognition-score-title">Input Filtered:</span>
                      <span className="recognition-status-pill pill-amber">
                        {recognitionResult.rejectionReason}
                      </span>
                    </div>
                    <div className="recognition-candidates-row">
                      <span className="candidates-label">Notice:</span>
                      <span className="rejection-hint-text">
                        {recognitionResult.rejectionMessage || 'Input too small or dot detected'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="recognition-badge-wrap">
                    <span className="recognition-label">
                      {recognitionResult?.status === 'UNCERTAIN' ? 'Uncertain' : 'Prediction'}
                    </span>
                    <span className={`recognition-digit ${recognitionResult?.status === 'UNCERTAIN' ? 'digit-uncertain' : ''}`}>
                      {recognitionResult?.status === 'UNCERTAIN'
                        ? `${recognitionResult.topPrediction}?`
                        : recognitionResult?.topPrediction}
                    </span>
                  </div>
                  <div className="recognition-details">
                    <div className="recognition-confidence-row">
                      <span className="recognition-score-title">Confidence:</span>
                      <span className={`recognition-score-val ${recognitionResult?.status === 'UNCERTAIN' ? 'score-uncertain' : ''}`}>
                        {(recognitionResult?.confidence * 100).toFixed(1)}%
                        {recognitionResult?.status === 'UNCERTAIN' ? ' (Low)' : ''}
                      </span>
                      <span className="recognition-latency-badge">⚡ {recognitionResult?.durationMs} ms</span>
                      <span className="recognition-engine-badge">
                        {selectedModelVersion === 'v2' ? 'Candidate V2' : 'Production V1'}
                      </span>
                    </div>
                    <div className="recognition-candidates-row">
                      <span className="candidates-label">Top 3:</span>
                      {recognitionResult?.candidates?.map((c, idx) => (
                        <span key={c.label} className={`candidate-pill ${idx === 0 ? 'candidate-first' : ''}`}>
                          <strong className="cand-rank">{idx + 1}.</strong> "{c.label}" ({Math.round(c.score * 100)}%)
                        </span>
                      ))}
                    </div>

                    {/* Phase 6: Side-by-Side Model Comparison (Same Gesture) */}
                    {recognitionResult?.comparison && (
                      <div className="recognition-comparison-bar">
                        <span className="comparison-title">Side-by-Side Comparison (Same Gesture):</span>
                        <div className="comparison-pills">
                          <div className={`comp-pill ${selectedModelVersion === 'v1' ? 'comp-pill-active' : ''}`}>
                            <span className="comp-model-tag">V1 (Prod):</span>
                            <span className="comp-pred">
                              {recognitionResult.comparison.v1.status === 'ACCEPTED' ? (
                                <>
                                  <strong>"{recognitionResult.comparison.v1.topPrediction}"</strong>
                                  <small> ({(recognitionResult.comparison.v1.confidence * 100).toFixed(1)}%)</small>
                                </>
                              ) : (
                                <em>{recognitionResult.comparison.v1.status}</em>
                              )}
                            </span>
                          </div>
                          <div className={`comp-pill ${selectedModelVersion === 'v2' ? 'comp-pill-active' : ''}`}>
                            <span className="comp-model-tag">V2 (Cand):</span>
                            <span className="comp-pred">
                              {recognitionResult.comparison.v2.status === 'ACCEPTED' ? (
                                <>
                                  <strong>"{recognitionResult.comparison.v2.topPrediction}"</strong>
                                  <small> ({(recognitionResult.comparison.v2.confidence * 100).toFixed(1)}%)</small>
                                </>
                              ) : (
                                <em>{recognitionResult.comparison.v2.status}</em>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Milestone 6.4 (Phases A & C): Expression & Practice Answer Append Bar */}
            {recognitionResult && recognitionResult.status !== 'REJECTED' && recognitionResult.topPrediction && (
              <div className="recognition-expression-commit-bar">
                {workspaceMode === 'solver' ? (
                  <button
                    type="button"
                    className="btn-append-to-expression"
                    onClick={() => handleAppendToken(recognitionResult.topPrediction, 'digit')}
                    title={`Append "${recognitionResult.topPrediction}" to mathematical expression and clear canvas`}
                    id="btn-append-recognized-digit"
                  >
                    <span className="btn-append-icon">➕</span>
                    <span>Add <strong>"{recognitionResult.topPrediction}"</strong> to Expression</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-append-to-expression btn-append-to-answer"
                    onClick={() => handleAppendAnswerDigit(recognitionResult.topPrediction)}
                    title={`Append "${recognitionResult.topPrediction}" to practice candidate answer and clear canvas`}
                    id="btn-append-recognized-answer-digit"
                  >
                    <span className="btn-append-icon">🎯</span>
                    <span>Add <strong>"{recognitionResult.topPrediction}"</strong> to Answer</span>
                  </button>
                )}
                <span className="commit-hint">
                  {workspaceMode === 'solver'
                    ? 'Appends digit to expression ribbon and resets canvas for next symbol'
                    : 'Appends digit to practice candidate answer buffer and resets canvas'}
                </span>
              </div>
            )}

            {/* Phase 6: Human Validation Trial Logger */}
            <div className="validation-logger-bar">
              <div className="val-logger-header">
                <span className="val-logger-title">
                  🎯 Phase 6 Manual Human Validation (Record Trial):
                </span>
                <span className="val-logger-hint">
                  Click intended digit to record accuracy for both V1 &amp; V2 (safe, non-destructive)
                </span>
              </div>
              <div className="val-digit-buttons">
                {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => {
                  const isPredicted = recognitionResult?.topPrediction === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`btn-val-digit ${isPredicted ? 'btn-val-predicted' : ''}`}
                      onClick={() => handleRecordValidationTrial(d)}
                      title={`Log human validation trial for intended digit "${d}"`}
                    >
                      {d} {isPredicted ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
              {validationToast && <span className="val-toast">{validationToast}</span>}
            </div>

            {/* Quick Tagging Bar */}
            <div className="recognition-tag-bar">
              <div className="tag-bar-header">
                <span className="tag-bar-title">Tag & Save Sample (Dataset):</span>
                <div className="tag-bar-session-selector">
                  <span className="tag-session-label">Saving to:</span>
                  <div className="tag-session-pills">
                    {SESSIONS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`btn-tag-session-pill ${currentSession === s.id ? 'active' : ''}`}
                        onClick={() => setCurrentSession(s.id)}
                        title={`Save sample into ${s.description}`}
                        id={`btn-tag-session-${s.id}`}
                      >
                        {s.label} ({s.split}) {currentSession === s.id ? '✓' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="tag-digit-buttons">
                {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="btn-tag-digit"
                    onClick={() => handleSaveSample(d)}
                    title={`Tag current drawing as "${d}" and add to ${currentSession.replace('_', ' ').toUpperCase()}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {corpusNotice && <span className="corpus-toast">{corpusNotice}</span>}
            </div>
          </div>
        )}

        {/* Milestone 6.4 (Phases A, B, & C): Mathematical Workspace */}
        <ExpressionWorkspace
          tokens={expressionTokens}
          onAppendToken={handleAppendToken}
          onRemoveToken={handleRemoveToken}
          onBackspace={handleBackspaceToken}
          onClearAll={handleClearExpression}
          mode={workspaceMode}
          onModeChange={setWorkspaceMode}
          answerDigits={answerDigits}
          answerSign={answerSign}
          onAppendAnswerDigit={handleAppendAnswerDigit}
          onBackspaceAnswer={handleBackspaceAnswer}
          onClearAnswer={handleClearAnswer}
          onToggleSign={handleToggleAnswerSign}
          onAddDecimal={handleAddAnswerDecimal}
        />

        {/* Phase 6: Human Validation Summary Panel */}
        {showValidationSummary && validationStats && (
          <div className="validation-summary-card" aria-label="Phase 6 Human Validation Summary">
            <div className="val-summary-header">
              <div className="val-summary-title-group">
                <h4>Phase 6 Human Validation Results (Comparative)</h4>
                <span className="val-summary-badge">
                  Total Trials: <strong>{validationStats.total}</strong>
                </span>
              </div>
              <div className="val-summary-actions">
                <button
                  type="button"
                  className="btn-val-action"
                  onClick={handleExportValidationLog}
                  title="Download JSON file of recorded validation trials"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="btn-val-action btn-val-clear"
                  onClick={handleClearValidationLog}
                  title="Reset all validation trial records"
                >
                  Clear Log
                </button>
              </div>
            </div>

            <div className="val-summary-score-cards">
              <div className="val-score-card v1-score-card">
                <span className="val-score-label">V1 (Production Baseline)</span>
                <span className="val-score-accuracy">{validationStats.v1Accuracy}%</span>
                <span className="val-score-sub">
                  {validationStats.v1Correct} / {validationStats.total} correct
                  {validationStats.v1Uncertain > 0 && ` (${validationStats.v1Uncertain} uncertain)`}
                </span>
              </div>
              <div className="val-score-card v2-score-card">
                <span className="val-score-label">V2 (Candidate Retrained)</span>
                <span className="val-score-accuracy">{validationStats.v2Accuracy}%</span>
                <span className="val-score-sub">
                  {validationStats.v2Correct} / {validationStats.total} correct
                  {validationStats.v2Uncertain > 0 && ` (${validationStats.v2Uncertain} uncertain)`}
                </span>
              </div>
            </div>

            <div className="val-table-container">
              <table className="val-breakdown-table">
                <thead>
                  <tr>
                    <th>Digit</th>
                    <th>Trials</th>
                    <th>V1 Accuracy</th>
                    <th>V2 Accuracy</th>
                    <th>V1 Confusions / Errors</th>
                    <th>V2 Confusions / Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => {
                    const row = validationStats.perDigit[d];
                    if (!row || row.trials === 0) {
                      return (
                        <tr key={d} className="row-empty">
                          <td><strong>{d}</strong></td>
                          <td>0</td>
                          <td>—</td>
                          <td>—</td>
                          <td>—</td>
                          <td>—</td>
                        </tr>
                      );
                    }
                    const v1Acc = ((row.v1Correct / row.trials) * 100).toFixed(0);
                    const v2Acc = ((row.v2Correct / row.trials) * 100).toFixed(0);
                    const v1ConfStr = Object.entries(row.v1Confusions)
                      .map(([k, v]) => `"${k}": ${v}`)
                      .join(', ') || 'None';
                    const v2ConfStr = Object.entries(row.v2Confusions)
                      .map(([k, v]) => `"${k}": ${v}`)
                      .join(', ') || 'None';

                    return (
                      <tr key={d} className={d === '8' ? 'row-highlight-8' : ''}>
                        <td><strong>{d}</strong></td>
                        <td>{row.trials}</td>
                        <td className={Number(v1Acc) >= 80 ? 'text-good' : 'text-poor'}>
                          {row.v1Correct}/{row.trials} ({v1Acc}%)
                        </td>
                        <td className={Number(v2Acc) >= 80 ? 'text-good' : 'text-poor'}>
                          {row.v2Correct}/{row.trials} ({v2Acc}%)
                        </td>
                        <td className="conf-col">{v1ConfStr}</td>
                        <td className="conf-col">{v2ConfStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Milestone 3: Fingertip & Air-Writing Telemetry Bar */}
        {cameraState === 'active' && (
          <div className="tracking-telemetry-bar">
            <div className="telemetry-item">
              <span className="telemetry-label">Status:</span>
              <span className={`telemetry-value ${
                drawingState === 'drawing' ? 'val-drawing' : drawingState === 'ready' ? 'val-ready' : 'val-muted'
              }`}>
                {drawingState === 'drawing' ? 'Drawing Active' : drawingState === 'ready' ? 'Ready (Open)' : 'No Hand'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Pinch Distance:</span>
              <span className={`telemetry-value ${trackingInfo.isPinching ? 'val-drawing' : ''}`}>
                {trackingInfo.pinchDistance !== null
                  ? `${trackingInfo.pinchDistance.toFixed(3)} ${trackingInfo.isPinching ? '(Pinching)' : '(Open)'}`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Strokes:</span>
              <span className="telemetry-value val-engine">
                {strokeCount} completed
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Tip (Pixel):</span>
              <span className="telemetry-value">
                {trackingInfo.indexTip
                  ? `${trackingInfo.indexTip.pixelX}px, ${trackingInfo.indexTip.pixelY}px`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Display:</span>
              <span className="telemetry-value val-engine">
                {trackingInfo.fps || 0} FPS
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Inference:</span>
              <span className="telemetry-value val-engine">
                {trackingInfo.inferenceFps || 0} FPS
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Processed:</span>
              <span className="telemetry-value val-engine">
                {strokeCount > 0
                  ? `${processedData.pointCountRaw} raw → ${processedData.pointCountProcessed} clean`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Aspect:</span>
              <span className="telemetry-value">
                {strokeCount > 0 ? `${processedData.aspectRatio}:1` : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Milestone 3: Real-Time Tracking & Dropout Diagnostics HUD */}
        {cameraState === 'active' && showDiagnostics && (
          <div className="diagnostics-panel" aria-label="Real-time Tracking Diagnostics HUD">
            <div className="diagnostics-header">
              <div className="diagnostics-header-left">
                <span className="diagnostics-title">Real-Time Tracking & Frame Rejection Diagnostics</span>
                <span className={`diagnostics-badge ${captureMode === 'continuous' ? 'badge-tracer' : ''}`}>
                  {captureMode === 'continuous' ? 'Continuous Tracer Mode (No Pinch)' : 'Pinch Air-Writing Mode'}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-reset-diag"
                onClick={resetDiagnosticCounters}
                title="Reset all frame rejection counters and event log to zero"
                id="btn-reset-diagnostics"
              >
                Reset Diagnostic Counters
              </button>
            </div>

            {/* Live Per-Frame Status Banner */}
            <div className={`diag-status-banner ${
              trackingInfo.isFrameRejected
                ? 'banner-rejected'
                : (trackingInfo.rejectionCategory === 'READY' || trackingInfo.rejectionCategory === 'NOT_PINCHING')
                ? 'banner-ready'
                : (trackingInfo.rejectionCategory === 'PINCH_DEBOUNCING')
                ? 'banner-debouncing'
                : 'banner-accepted'
            }`}>
              <div className="banner-indicator">
                <span className={`banner-dot ${
                  trackingInfo.isFrameRejected
                    ? 'dot-rejected'
                    : (trackingInfo.rejectionCategory === 'READY' || trackingInfo.rejectionCategory === 'NOT_PINCHING')
                    ? 'dot-ready'
                    : (trackingInfo.rejectionCategory === 'PINCH_DEBOUNCING')
                    ? 'dot-debouncing'
                    : 'dot-accepted'
                }`}></span>
                <strong>
                  {trackingInfo.isFrameRejected
                    ? `FRAME REJECTED (${trackingInfo.rejectionCategory})`
                    : (trackingInfo.rejectionCategory === 'READY' || trackingInfo.rejectionCategory === 'NOT_PINCHING')
                    ? 'READY (HOVERING)'
                    : (trackingInfo.rejectionCategory === 'PINCH_DEBOUNCING')
                    ? 'DEBOUNCING (HOLDING)'
                    : (trackingInfo.rejectionCategory === 'STATIONARY_HOLD')
                    ? 'DRAWING ACTIVE (STATIONARY)'
                    : 'DRAWING ACTIVE (POINT ADDED)'}
                </strong>
              </div>
              <div className="banner-reason">
                {trackingInfo.rejectionReason || (trackingInfo.isFrameRejected ? 'Frame discarded by capture validation' : 'Tracking active')}
              </div>
            </div>

            {/* Cumulative Frame Rejection Counters Grid (Requirement 2) */}
            <div className="diag-section-label">Cumulative Frame & Rejection Counters</div>
            <div className="counters-grid">
              <div className="counter-box">
                <span className="counter-label">Total Inferences:</span>
                <span className="counter-num val-engine">{rejectionCounters.totalFrames}</span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Accepted Points:</span>
                <span className="counter-num val-ready">{rejectionCounters.acceptedFrames}</span>
              </div>
              <div className="counter-box">
                <span className="counter-label">No Hand Drops:</span>
                <span className={`counter-num ${rejectionCounters.rejectedNoHand > 0 ? 'val-warning' : ''}`}>
                  {rejectionCounters.rejectedNoHand}
                </span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Low Confidence:</span>
                <span className={`counter-num ${rejectionCounters.rejectedLowConfidence > 0 ? 'val-warning' : ''}`}>
                  {rejectionCounters.rejectedLowConfidence}
                </span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Teleport Jumps:</span>
                <span className={`counter-num ${rejectionCounters.rejectedTeleport > 0 ? 'val-warning' : ''}`}>
                  {rejectionCounters.rejectedTeleport}
                </span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Palm Scale Anom:</span>
                <span className={`counter-num ${rejectionCounters.rejectedPalmScale > 0 ? 'val-warning' : ''}`}>
                  {rejectionCounters.rejectedPalmScale}
                </span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Resume Gap Rej:</span>
                <span className={`counter-num ${rejectionCounters.rejectedResumeGap > 0 ? 'val-warning' : ''}`}>
                  {rejectionCounters.rejectedResumeGap}
                </span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Pinch Releases:</span>
                <span className="counter-num">{rejectionCounters.pinchReleases}</span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Strokes Resumed:</span>
                <span className="counter-num val-ready">{rejectionCounters.strokesResumed}</span>
              </div>
              <div className="counter-box">
                <span className="counter-label">Strokes Split:</span>
                <span className={`counter-num ${rejectionCounters.strokesSplit > 0 ? 'val-warning' : ''}`}>
                  {rejectionCounters.strokesSplit}
                </span>
              </div>
            </div>

            {/* Real-Time Telemetry & Metric Measurements (Requirement 1 & 4) */}
            <div className="diag-section-label" style={{ marginTop: '0.85rem' }}>Live Frame Telemetry & Velocity</div>
            <div className="diagnostics-grid">
              <div className="diag-item">
                <span className="diag-label">Display Rate (RAF):</span>
                <span className="diag-val val-engine">{trackingInfo.fps || 0} FPS</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Inference Rate:</span>
                <span className="diag-val val-engine">{trackingInfo.inferenceFps || 0} FPS</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Inference Latency:</span>
                <span className="diag-val">{trackingInfo.inferenceDurationMs || 0} ms</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Fingertip Speed:</span>
                <span className="diag-val val-engine">
                  {trackingInfo.velocity?.speedPxPerSec || 0} px/s
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Velocity (Vx, Vy):</span>
                <span className="diag-val">
                  Vx: {trackingInfo.velocity?.vxPxPerSec || 0}, Vy: {trackingInfo.velocity?.vyPxPerSec || 0}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Hand Detection:</span>
                <span className={`diag-val ${trackingInfo.handDetected ? 'val-ready' : (trackingInfo.isGraceActive ? 'val-warning' : 'val-muted')}`}>
                  {trackingInfo.handDetected ? 'DETECTED' : (trackingInfo.isGraceActive ? 'GRACE (HOLDING)' : 'NOT DETECTED')}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Fingertip Stability:</span>
                <span className={`diag-val ${trackingInfo.fingertipStable ? 'val-ready' : 'val-warning'}`}>
                  {trackingInfo.fingertipStable ? 'STABLE' : 'UNSTABLE'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Raw Tip (X, Y):</span>
                <span className="diag-val">
                  {trackingInfo.rawTip ? `${trackingInfo.rawTip.normX.toFixed(3)}, ${trackingInfo.rawTip.normY.toFixed(3)} [${trackingInfo.rawTip.pixelX}, ${trackingInfo.rawTip.pixelY}]` : '—'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Filtered Tip (X, Y):</span>
                <span className="diag-val">
                  {trackingInfo.filteredTip ? `${trackingInfo.filteredTip.normX.toFixed(3)}, ${trackingInfo.filteredTip.normY.toFixed(3)} [${trackingInfo.filteredTip.pixelX}, ${trackingInfo.filteredTip.pixelY}]` : '—'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Filter Lag Vector:</span>
                <span className="diag-val val-engine">
                  {trackingInfo.filterOffsetPx ? `${trackingInfo.filterOffsetPx} px (Δ ${trackingInfo.filterOffsetNorm?.toFixed(4)})` : '0 px'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Pinch Distance (Eff):</span>
                <span className={`diag-val ${trackingInfo.isPinching ? 'val-drawing' : 'val-ready'}`}>
                  {trackingInfo.effectivePinchDistance !== null && trackingInfo.effectivePinchDistance !== undefined ? trackingInfo.effectivePinchDistance.toFixed(3) : '—'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Pinch (Raw / Smooth):</span>
                <span className="diag-val">
                  Raw: {trackingInfo.rawPinchDistance !== null && trackingInfo.rawPinchDistance !== undefined ? trackingInfo.rawPinchDistance.toFixed(3) : '—'}, Sm: {trackingInfo.smoothedPinchDistance !== null && trackingInfo.smoothedPinchDistance !== undefined ? trackingInfo.smoothedPinchDistance.toFixed(3) : '—'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Aspect-Corrected Px:</span>
                <span className="diag-val">
                  {trackingInfo.pixelPinchDistance !== null && trackingInfo.pixelPinchDistance !== undefined ? `${trackingInfo.pixelPinchDistance} px` : '—'}
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Drawing Status:</span>
                <span className={`diag-val ${drawingState === 'drawing' ? 'val-drawing' : drawingState === 'ready' ? 'val-ready' : 'val-muted'}`}>
                  {drawingState.toUpperCase()} ({captureMode === 'continuous' ? 'TRACER' : 'PINCH'})
                </span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Edge Proximity:</span>
                <span className={`diag-val ${trackingInfo.boundaryStatus?.isWristClipped ? 'val-warning' : (trackingInfo.boundaryStatus?.isNearEdge ? 'val-warning' : 'val-ready')}`}>
                  {trackingInfo.boundaryStatus?.warning || (trackingInfo.boundaryStatus?.isNearEdge ? 'NEAR EDGE (<5%)' : 'SAFE INTERIOR')}
                </span>
              </div>
            </div>

            {/* Event-Based Diagnostics Log */}
            {trackingInfo.eventLog && trackingInfo.eventLog.length > 0 && (
              <div className="diag-events-container">
                <div className="diag-events-header">
                  <span className="diag-events-title">Event-Based State Transition & Rejection Log</span>
                  <span className="diag-events-count">{trackingInfo.eventLog.length} recorded</span>
                </div>
                <div className="diag-events-list">
                  {trackingInfo.eventLog.slice(0, 8).map((evt) => (
                    <div key={evt.id} className="diag-event-row">
                      <span className="diag-event-time">{evt.timeStr}</span>
                      <span className={`diag-event-tag tag-${evt.type.toLowerCase().replace(/_/g, '-')}`}>
                        {evt.type}
                      </span>
                      <span className="diag-event-reason">{evt.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Milestone 4 & 5: Normalized Stroke Processing & Dataset Inspector */}
        {showInspector && (
          <div className="stroke-inspector-panel" aria-label="M4/M5 Stroke Processing and Recognition Inspector">
            <div className="inspector-header">
              <div className="inspector-title-group">
                <span className="inspector-title">M4/M5 Stroke Processing, Recognition & Dataset Inspector</span>
                <span className="inspector-pill">Aspect-Ratio Preserved [0, 1]</span>
                <span className="inspector-pill pill-cyan">Arc-Length Resampled</span>
                <span className="inspector-pill" style={{ borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399' }}>
                  M5 Local MLP (76 dims)
                </span>
              </div>
              <button
                onClick={() => setShowInspector(false)}
                className="btn-close-inspector"
                title="Close Inspector"
                id="btn-close-inspector"
              >
                ✕
              </button>
            </div>

            <div className="inspector-body">
              {/* Left Column: Normalized [0, 1] Coordinate Space Canvas */}
              <div className="inspector-canvas-card">
                <div className="canvas-header-label">
                  <span>Normalized Unit Box [0, 1]</span>
                  <span className="canvas-sub-label">Colors show stroke temporal order</span>
                </div>
                <div className="inspector-canvas-wrap">
                  <canvas
                    ref={normalizedCanvasRef}
                    width={280}
                    height={280}
                    className="normalized-canvas"
                    id="normalized-stroke-canvas"
                  />
                </div>
                <div className="canvas-legend">
                  <span className="legend-item"><span className="legend-dot dot-start"></span> Start</span>
                  <span className="legend-item"><span className="legend-dot dot-end"></span> End</span>
                  <span className="legend-item"><span className="legend-dot dot-vertex"></span> Resampled node</span>
                  <span className="legend-item"><span className="legend-box-border"></span> Bounding Box</span>
                </div>
              </div>

              {/* Right Column: Geometry Metrics & JSON Export / Dataset Tab */}
              <div className="inspector-metrics-card">
                <div className="metrics-grid">
                  <div className="metric-box">
                    <span className="metric-name">Strokes Order</span>
                    <span className="metric-val">{processedData.strokeCount} strokes</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-name">Points (Raw → Clean)</span>
                    <span className="metric-val val-engine">
                      {processedData.pointCountRaw} → {processedData.pointCountProcessed}
                    </span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-name">Jitter Reduction</span>
                    <span className="metric-val val-ready">
                      {processedData.pointCountRaw > 0
                        ? `${Math.round((1 - processedData.pointCountProcessed / processedData.pointCountRaw) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-name">Aspect Ratio (W/H)</span>
                    <span className="metric-val">{processedData.aspectRatio}:1</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-name">Top Prediction</span>
                    <span className="metric-val val-ready">
                      {recognitionResult ? `"${recognitionResult.topPrediction}" (${(recognitionResult.confidence * 100).toFixed(1)}%)` : '—'}
                    </span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-name">Inference Latency</span>
                    <span className="metric-val val-engine">
                      {recognitionResult ? `${recognitionResult.durationMs} ms` : '—'}
                    </span>
                  </div>
                </div>

                {/* Data Viewer & Dataset Tool */}
                <div className="json-viewer-container">
                  <div className="json-viewer-header">
                    <div className="json-tab-group">
                      <button
                        type="button"
                        className={`json-tab ${jsonViewTab === 'normalized' ? 'active' : ''}`}
                        onClick={() => setJsonViewTab('normalized')}
                        id="tab-json-normalized"
                      >
                        Normalized JSON (M4)
                      </button>
                      <button
                        type="button"
                        className={`json-tab ${jsonViewTab === 'raw' ? 'active' : ''}`}
                        onClick={() => setJsonViewTab('raw')}
                        id="tab-json-raw"
                      >
                        Raw Stroke JSON
                      </button>
                      <button
                        type="button"
                        className={`json-tab ${jsonViewTab === 'dataset' ? 'active' : ''}`}
                        onClick={() => setJsonViewTab('dataset')}
                        id="tab-json-dataset"
                      >
                        M5 Dataset Collector ({corpus.length})
                      </button>
                    </div>

                    {jsonViewTab !== 'dataset' && (
                      <button
                        type="button"
                        className="btn-copy-json"
                        id="btn-copy-stroke-json"
                        onClick={() => {
                          const contentToCopy = JSON.stringify(
                            jsonViewTab === 'normalized'
                              ? {
                                  strokeCount: processedData.strokeCount,
                                  pointCountRaw: processedData.pointCountRaw,
                                  pointCountProcessed: processedData.pointCountProcessed,
                                  aspectRatio: processedData.aspectRatio,
                                  boundingBox: processedData.boundingBox,
                                  normalizationMeta: processedData.normalizationMeta,
                                  processingDurationMs: processedData.processingDurationMs,
                                  strokes: processedData.strokes,
                                }
                              : processedData.rawStrokes,
                            null,
                            2
                          );
                          navigator.clipboard.writeText(contentToCopy);
                          setCopiedJson(true);
                          setTimeout(() => setCopiedJson(false), 2000);
                        }}
                      >
                        {copiedJson ? '✓ Copied!' : 'Copy JSON'}
                      </button>
                    )}
                  </div>

                  {jsonViewTab === 'dataset' ? (
                    <div className="dataset-container">
                      <div className="dataset-summary-box">
                        <div className="dataset-summary-header">
                          <span>Air-Writing Samples Corpus</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <span className="inspector-pill pill-cyan" title="Total samples in corpus">Total: {corpusStats.total}</span>
                            <span className="inspector-pill" style={{ backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }} title="Genuine webcam samples captured in M4 format">
                              Genuine: {corpusStats.genuineCount}
                            </span>
                            {corpusStats.seedCount > 0 && (
                              <span className="inspector-pill" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }} title="Synthetic seed samples">
                                Seeds: {corpusStats.seedCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="dataset-badge-grid">
                          {Object.entries(corpusStats.perDigit).map(([digit, count]) => (
                            <div key={digit} className="digit-counter-pill">
                              <span className="digit-pill-label">Digit {digit}</span>
                              <span className="digit-pill-count">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Active Collection Session Partition Card */}
                      <div className="dataset-session-card">
                        <div className="dataset-session-header">
                          <span className="dataset-session-title">Active Collection Session Partition</span>
                          <span className="dataset-session-sub">Click a session to set where incoming air-writing samples are stored</span>
                        </div>
                        <div className="dataset-session-grid">
                          {SESSIONS.map((s) => {
                            const isSelected = currentSession === s.id;
                            const count = corpusStats.sessionCounts[s.id] || 0;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`dataset-session-box ${isSelected ? 'active' : ''}`}
                                onClick={() => setCurrentSession(s.id)}
                                title={`Select ${s.description}`}
                                id={`btn-dataset-session-${s.id}`}
                              >
                                <div className="session-box-header">
                                  <span className="session-box-name">{s.label.toUpperCase()}</span>
                                  <span className={`session-split-badge split-${s.split.toLowerCase()}`}>
                                    {s.split} Split
                                  </span>
                                </div>
                                <div className="session-box-body">
                                  <div className="session-box-count">
                                    <span className="count-num">{count}</span>
                                    <span className="count-unit">samples</span>
                                  </div>
                                  <span className={`session-status-badge ${isSelected ? 'badge-current' : ''}`}>
                                    {isSelected ? '✓ ACTIVE' : 'Select'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="dataset-actions-row">
                        <button
                          type="button"
                          className="btn-corpus-action"
                          style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                          onClick={handleSyncToBackend}
                          title="Save all local samples directly to backend storage (backend/data/genuine_collected.json)"
                        >
                          ☁️ Sync to Backend
                        </button>

                        <button
                          type="button"
                          className="btn-corpus-action"
                          onClick={handleExportCorpus}
                          title="Download full corpus as JSON file"
                        >
                          📥 Export Corpus JSON
                        </button>

                        <label className="btn-corpus-action" title="Import JSON corpus file">
                          📂 Import Corpus File
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImportCorpus}
                            style={{ display: 'none' }}
                          />
                        </label>

                        <button
                          type="button"
                          className="btn-corpus-action btn-eval"
                          onClick={handleEvaluateCorpus}
                          title="Run M5 Model on all samples in corpus and compute accuracy"
                        >
                          ▶ Evaluate Corpus on M5 Model
                        </button>

                        <button
                          type="button"
                          className="btn-corpus-action btn-danger"
                          onClick={handleClearCorpus}
                          title="Clear all saved samples"
                        >
                          🗑 Clear Corpus
                        </button>
                      </div>

                      {corpusNotice && <div className="corpus-toast">{corpusNotice}</div>}

                      {/* Live In-Browser Corpus Evaluation Results */}
                      {corpusEvaluation && (
                        <div className="corpus-eval-results">
                          <div className="eval-summary-header">
                            <span>Corpus Scorecard ({corpusEvaluation.total} samples):</span>
                            <span className="eval-stat-chip">
                              Top-1 Acc: {(corpusEvaluation.top1Accuracy * 100).toFixed(1)}%
                            </span>
                            <span className="eval-stat-chip">
                              Top-3 Acc: {(corpusEvaluation.top3Accuracy * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="eval-grid-breakdown">
                            {Object.entries(corpusEvaluation.perDigit).map(([d, stat]) => (
                              <div key={d} className="eval-digit-chip">
                                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{d}</span>
                                <span>
                                  {stat.correct}/{stat.total}
                                </span>
                                <span style={{ color: stat.correct === stat.total ? '#34d399' : '#fbbf24' }}>
                                  {stat.total > 0 ? `${Math.round((stat.correct / stat.total) * 100)}%` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="json-code-block">
                      <code>
                        {JSON.stringify(
                          jsonViewTab === 'normalized'
                            ? {
                                strokeCount: processedData.strokeCount,
                                pointCountRaw: processedData.pointCountRaw,
                                pointCountProcessed: processedData.pointCountProcessed,
                                aspectRatio: processedData.aspectRatio,
                                boundingBox: processedData.boundingBox,
                                normalizationMeta: processedData.normalizationMeta,
                                processingDurationMs: processedData.processingDurationMs,
                                strokes: processedData.strokes,
                              }
                            : processedData.rawStrokes,
                          null,
                          2
                        )}
                      </code>
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
