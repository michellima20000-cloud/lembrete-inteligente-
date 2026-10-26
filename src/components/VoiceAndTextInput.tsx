import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Send,
  CalendarCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Sparkles,
  Zap,
  Loader2,
  Volume2,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import {
  formatTranscriptPretty,
  isOnlyTemporalQuery,
} from '../utils/reminderParser';
import { soundAlert } from '../utils/audioAlert';

interface VoiceAndTextInputProps {
  onOpenManualModal: () => void;
}

// Convert audio blob to base64 string
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const VoiceAndTextInput: React.FC<VoiceAndTextInputProps> = ({ onOpenManualModal }) => {
  const { processAiCommand, isProcessingAi } = useReminders();

  const [inputText, setInputText] = useState('');
  const [selectedAntecedencia, setSelectedAntecedencia] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [interimSpokenText, setInterimSpokenText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoScheduleCountdown, setAutoScheduleCountdown] = useState<number | null>(null);
  const [autoScheduleProgress, setAutoScheduleProgress] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);
  const [speechEngineNotice, setSpeechEngineNotice] = useState<string | null>(null);

  // References to preserve state across async closures and speech callbacks
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);
  const restartTimeoutRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const latestTranscriptRef = useRef<string>('');
  const isAutoSchedulingRef = useRef<boolean>(false);
  const accumulatedFinalTextRef = useRef<string>('');
  const activeEngineRef = useRef<'webspeech' | 'mediarecorder'>('webspeech');

  // Clear countdown intervals safely
  const clearCountdown = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setAutoScheduleCountdown(null);
    setAutoScheduleProgress(0);
  }, []);

  // Cleanup all audio and speech recognition hardware tracks
  const stopHardwareStreams = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Submit and schedule reminder through AI backend
  const scheduleReminderText = useCallback(
    async (textToSchedule: string) => {
      const clean = formatTranscriptPretty(textToSchedule || inputText).trim();

      if (!clean) {
        setFeedbackMessage({
          type: 'erro',
          text: 'Fale no microfone ou digite o lembrete que deseja agendar.',
        });
        return;
      }

      // Check if user only said "hoje" or temporal words
      if (isOnlyTemporalQuery(clean)) {
        setFeedbackMessage({
          type: 'erro',
          text: `Você informou apenas o dia ou horário ("${clean}"). Diga também a tarefa, por exemplo: "${clean} tomar remédio".`,
        });
        return;
      }

      if (isAutoSchedulingRef.current) return;
      isAutoSchedulingRef.current = true;
      clearCountdown();

      // Stop speech recognition and hardware streams cleanly
      isRecordingRef.current = false;
      setIsRecording(false);
      stopHardwareStreams();

      try {
        const result = await processAiCommand({
          texto: clean,
          antecedenciaPadrao: selectedAntecedencia,
        });

        setInputText('');
        setSpeechTranscript('');
        setInterimSpokenText('');
        latestTranscriptRef.current = '';
        accumulatedFinalTextRef.current = '';
        soundAlert.playSuccess();
        setFeedbackMessage({
          type: 'sucesso',
          text: result.mensagem_sistema || 'Lembrete agendado automaticamente com sucesso!',
        });
        setTimeout(() => setFeedbackMessage(null), 7000);
      } catch (err: any) {
        console.warn('Error scheduling reminder:', err);
        setFeedbackMessage({
          type: 'erro',
          text: err?.message || 'Não foi possível agendar o lembrete. Tente falar novamente ou digite o texto.',
        });
      } finally {
        isAutoSchedulingRef.current = false;
        setIsRecording(false);
      }
    },
    [processAiCommand, selectedAntecedencia, inputText, clearCountdown, stopHardwareStreams]
  );

  // Auto-schedule triggered after natural pause when speech has a valid sentence
  const handleTranscriptActivity = useCallback(
    (currentTranscript: string) => {
      clearCountdown();

      const words = currentTranscript.trim().split(/\s+/);
      // Only start auto-countdown if transcript has at least 2 words and isn't just a temporal indicator
      if (words.length < 2 || isOnlyTemporalQuery(currentTranscript)) {
        return;
      }

      // 2.2-second natural silence window: gives user time to speak peacefully without rushing
      const TOTAL_MS = 2200;
      const STEP_MS = 50;
      let elapsed = 0;

      setAutoScheduleCountdown(2);
      setAutoScheduleProgress(0);

      progressIntervalRef.current = setInterval(() => {
        elapsed += STEP_MS;
        const pct = Math.min(100, Math.round((elapsed / TOTAL_MS) * 100));
        setAutoScheduleProgress(pct);
        const remainingSeconds = Math.max(1, Math.ceil((TOTAL_MS - elapsed) / 1000));
        setAutoScheduleCountdown(remainingSeconds);

        if (elapsed >= TOTAL_MS) {
          clearCountdown();
          if (latestTranscriptRef.current && isRecordingRef.current && !isAutoSchedulingRef.current) {
            scheduleReminderText(latestTranscriptRef.current);
          }
        }
      }, STEP_MS);
    },
    [clearCountdown, scheduleReminderText]
  );

  // Fallback engine: Audio recording via MediaRecorder for browsers without Web Speech
  const startMediaRecorderFallback = useCallback(async () => {
    try {
      activeEngineRef.current = 'mediarecorder';
      setSpeechEngineNotice('Gravando áudio com alta nitidez... Fale seu lembrete e clique em Agendar.');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
        setIsSpeaking(true);
      }
    } catch (err: any) {
      console.warn('Fallback recorder failed:', err);
      setIsRecording(false);
      isRecordingRef.current = false;
      setFeedbackMessage({
        type: 'erro',
        text: 'Não foi possível acessar o microfone. Verifique as permissões de áudio no seu navegador.',
      });
    }
  }, []);

  // Duration timer for active microphone
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      clearCountdown();
      stopHardwareStreams();
    };
  }, [clearCountdown, stopHardwareStreams]);

  // Main Voice Capture starter
  // CRITICAL: Web Speech API is used completely independently without simultaneous MediaRecorder
  // This eliminates all microphone hardware lock conflicts across Chrome, mobile devices, and deployed sites!
  const startVoiceCapture = async () => {
    setFeedbackMessage(null);
    setSpeechEngineNotice(null);
    clearCountdown();
    stopHardwareStreams();

    isAutoSchedulingRef.current = false;
    setSpeechTranscript('');
    setInterimSpokenText('');
    latestTranscriptRef.current = '';
    accumulatedFinalTextRef.current = '';
    audioChunksRef.current = [];

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pt-BR';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          isRecordingRef.current = true;
          setIsRecording(true);
          activeEngineRef.current = 'webspeech';
        };

        recognition.onspeechstart = () => {
          setIsSpeaking(true);
        };

        recognition.onspeechend = () => {
          setIsSpeaking(false);
        };

        recognition.onsoundstart = () => {
          setIsSpeaking(true);
        };

        recognition.onsoundend = () => {
          setIsSpeaking(false);
        };

        recognition.onresult = (event: any) => {
          let currentInterim = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            const text = item[0]?.transcript || '';
            if (item.isFinal) {
              const currentFinal = accumulatedFinalTextRef.current;
              accumulatedFinalTextRef.current = currentFinal
                ? `${currentFinal} ${text.trim()}`
                : text.trim();
            } else {
              currentInterim += (currentInterim ? ' ' : '') + text;
            }
          }

          const combined = (
            accumulatedFinalTextRef.current +
            (currentInterim ? ' ' + currentInterim : '')
          ).trim();

          if (combined) {
            const pretty = formatTranscriptPretty(combined);
            latestTranscriptRef.current = pretty;
            setSpeechTranscript(pretty);
            setInterimSpokenText(currentInterim);
            setInputText(pretty);
            setIsSpeaking(true);
            handleTranscriptActivity(pretty);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition error event:', event.error);

          if (event.error === 'no-speech') {
            return;
          }

          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            isRecordingRef.current = false;
            setIsRecording(false);
            setFeedbackMessage({
              type: 'erro',
              text: 'Permissão de microfone negada. Clique no ícone de cadeado ao lado do endereço do site e permita o acesso ao microfone.',
            });
            return;
          }

          // Network or audio capture issue in Chrome speech service: fallback seamlessly to MediaRecorder
          if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
            try {
              recognition.stop();
            } catch {}
            recognitionRef.current = null;
            startMediaRecorderFallback();
          }
        };

        recognition.onend = () => {
          // Keep recognition alive if still in recording mode and user hasn't finished
          if (isRecordingRef.current && !isAutoSchedulingRef.current && activeEngineRef.current === 'webspeech') {
            restartTimeoutRef.current = setTimeout(() => {
              if (isRecordingRef.current && !isAutoSchedulingRef.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (e) {
                  console.warn('Recognition restart notice:', e);
                }
              }
            }, 150);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
        isRecordingRef.current = true;
        setIsRecording(true);
        activeEngineRef.current = 'webspeech';
        return;
      } catch (err: any) {
        console.warn('Could not start native WebSpeech, falling back to MediaRecorder:', err);
        startMediaRecorderFallback();
      }
    } else {
      // Browser does not support Web Speech API natively (e.g. Firefox)
      startMediaRecorderFallback();
    }
  };

  // Stop voice capture and process reminder (using real-time transcript or fallback Gemini transcription)
  const stopVoiceCaptureAndSchedule = async () => {
    if (!isRecordingRef.current && !isRecording) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    clearCountdown();

    const isUsingMediaRecorder = activeEngineRef.current === 'mediarecorder';
    const recorder = mediaRecorderRef.current;

    let audioBlobPromise: Promise<Blob | null> = Promise.resolve(null);
    if (recorder && recorder.state !== 'inactive') {
      audioBlobPromise = new Promise((resolve) => {
        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const mime = recorder.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mime });
            resolve(blob);
          } else {
            resolve(null);
          }
        };
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      });
    }

    // Stop mic tracks and recognition
    stopHardwareStreams();

    // 1. Check if live Web Speech already captured the text with clarity
    const liveText = formatTranscriptPretty(latestTranscriptRef.current || inputText).trim();
    if (liveText.length >= 2 && !isOnlyTemporalQuery(liveText)) {
      scheduleReminderText(liveText);
      return;
    }

    // 2. If Web Speech was silent or in MediaRecorder fallback mode, transcribe via server API
    if (isUsingMediaRecorder) {
      const audioBlob = await audioBlobPromise;
      if (audioBlob && audioBlob.size > 1000) {
        setIsTranscribing(true);
        setFeedbackMessage({
          type: 'sucesso',
          text: 'Processando áudio com Inteligência Artificial...',
        });

        try {
          const base64Audio = await blobToBase64(audioBlob);
          const resp = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64Audio,
              mimeType: audioBlob.type || 'audio/webm',
            }),
          });

          const isJson = resp.headers.get('content-type')?.includes('application/json');
          if (resp.ok && isJson) {
            const data = await resp.json();
            if (data.status === 'sucesso' && data.transcript && data.transcript.trim()) {
              const pretty = formatTranscriptPretty(data.transcript);
              setInputText(pretty);
              setSpeechTranscript(pretty);
              latestTranscriptRef.current = pretty;
              setIsTranscribing(false);
              scheduleReminderText(pretty);
              return;
            }
          }
        } catch (err: any) {
          console.warn('Erro ao transcrever com Gemini:', err);
        } finally {
          setIsTranscribing(false);
        }
      }
    }

    // If still no valid text was detected
    if (!liveText) {
      setFeedbackMessage({
        type: 'erro',
        text: 'Nenhuma fala foi identificada. Verifique se o microfone está ativo no navegador ou digite seu lembrete.',
      });
    } else {
      scheduleReminderText(liveText);
    }
  };

  const cancelVoiceCapture = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    clearCountdown();
    setSpeechTranscript('');
    setInterimSpokenText('');
    setSpeechEngineNotice(null);
    latestTranscriptRef.current = '';
    accumulatedFinalTextRef.current = '';
    stopHardwareStreams();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isRecording) {
      stopVoiceCaptureAndSchedule();
      return;
    }
    scheduleReminderText(inputText);
  };

  const hasDetectedSpeech = speechTranscript.trim().length > 0;
  const isSpeechValid = hasDetectedSpeech && !isOnlyTemporalQuery(speechTranscript);

  return (
    <section className="bg-slate-900/90 rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-2xl backdrop-blur-md">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span>Comando por Voz ou Texto</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider border border-emerald-500/30">
                Nitidez Total
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Fale e o lembrete é compreendido e agendado sozinho</span>
            </p>
          </div>
        </div>

        <button
          onClick={onOpenManualModal}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-white py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 transition cursor-pointer shadow-sm"
          title="Agendamento manual com campos de data e hora"
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span>Manual</span>
        </button>
      </div>

      {/* Main Input Box */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative rounded-2xl bg-slate-800/95 border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition shadow-inner">
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              latestTranscriptRef.current = e.target.value;
            }}
            placeholder='Fale no microfone ou digite: "Hoje às 15h tomar remédio" ou "Pagar conta amanhã às 10h"...'
            disabled={isProcessingAi || isTranscribing}
            className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none resize-none disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {/* Bottom Bar inside Input */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-slate-700/50">
            {/* Antecedência Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3 text-indigo-400" />
                Avisar:
              </span>
              {[
                { label: 'No horário', val: 0 },
                { label: '5m antes', val: 5 },
                { label: '10m antes', val: 10 },
                { label: '15m antes', val: 15 },
                { label: '30m antes', val: 30 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setSelectedAntecedencia(opt.val)}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition shrink-0 cursor-pointer ${
                    selectedAntecedencia === opt.val
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Actions: Mic & Submit */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Voice button */}
              <button
                type="button"
                onClick={isRecording ? stopVoiceCaptureAndSchedule : startVoiceCapture}
                disabled={isProcessingAi || isTranscribing}
                className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/50 scale-105 ring-4 ring-rose-500/30'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/40 active:scale-95'
                }`}
                title={isRecording ? 'Clique para parar e agendar imediatamente' : 'Falar comando no microfone'}
                aria-label="Falar comando no microfone"
              >
                {isRecording ? (
                  <MicOff className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
                ) : (
                  <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
                {isRecording && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                )}
              </button>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessingAi || isTranscribing || !inputText.trim()}
                className="flex items-center gap-1.5 px-4 h-11 sm:h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
              >
                {isProcessingAi ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Agendando...</span>
                  </>
                ) : (
                  <>
                    <span>Agendar</span>
                    <Send className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Quick Suggestion Chips */}
      {!isRecording && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Exemplos:
          </span>
          {[
            'Tomar remédio todo dia às 08h',
            'Reunião toda segunda às 09h',
            'Pagar boleto amanhã às 14h',
            'Alongamento de segunda a sexta às 16h',
          ].map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => {
                setInputText(sug);
                latestTranscriptRef.current = sug;
              }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition cursor-pointer"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* AI Audio Transcription in progress state */}
      {isTranscribing && (
        <div className="mt-3 p-3.5 rounded-2xl bg-indigo-950/90 border border-indigo-500/50 text-xs text-indigo-200 flex items-center gap-3 animate-in fade-in shadow-lg">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
          <div>
            <p className="font-bold text-white text-xs">Processando áudio com Inteligência Artificial...</p>
            <p className="text-[11px] text-indigo-300">Convertendo sua fala com precisão e organizando os horários.</p>
          </div>
        </div>
      )}

      {/* Recording in progress overlay bar with live real-time voice volume waveform and automatic scheduling countdown */}
      {isRecording && (
        <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-slate-800/95 border-2 border-indigo-500/70 shadow-2xl text-xs text-slate-100 animate-in fade-in space-y-3">
          {/* Top Row: Status + Real-Time Voice Waveform + Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>

              {/* Dynamic Equalizer Waveform reacting live to speech activity */}
              <div className="flex items-center gap-1 h-7 px-2.5 py-1 bg-slate-900/90 rounded-xl border border-slate-700/80">
                {[0.5, 0.9, 1.2, 0.7, 1.1, 0.8, 0.6].map((scale, idx) => (
                  <span
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isSpeaking
                        ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                        : 'bg-slate-600'
                    }`}
                    style={{
                      height: isSpeaking ? `${Math.round(8 + scale * 12)}px` : '6px',
                    }}
                  />
                ))}
              </div>

              <div>
                <span className="font-bold text-white tracking-wide text-xs flex items-center gap-1.5">
                  <span>Microfone Aberto ({recordingSeconds}s)</span>
                  {isSpeaking && (
                    <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" />
                      <span>Ouvindo sua voz</span>
                    </span>
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
                  {isSpeaking
                    ? 'Capturando sua fala com nitidez • Suas palavras aparecem ao vivo abaixo'
                    : 'Fale agora seu compromisso (ex: "hoje às 15 horas tomar remédio")...'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={cancelVoiceCapture}
                className="text-[11px] text-slate-400 hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-slate-700/80 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={stopVoiceCaptureAndSchedule}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/40 transition cursor-pointer active:scale-95 flex items-center gap-1.5"
                title="Agendar imediatamente"
              >
                <span>Agendar Agora</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Engine notice if in fallback mode */}
          {speechEngineNotice && (
            <div className="p-2 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-[11px] text-indigo-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{speechEngineNotice}</span>
            </div>
          )}

          {/* Automatic Scheduling Indicator & Fluid Progress Bar */}
          {autoScheduleCountdown !== null && isSpeechValid && (
            <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                  <span>Fala reconhecida! Agendando automaticamente...</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-200">
                  {autoScheduleProgress}%
                </span>
              </div>
              {/* Animated Progress Bar */}
              <div className="w-full bg-slate-900/90 h-1.5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 h-full rounded-full transition-all duration-75 ease-linear shadow-sm"
                  style={{ width: `${autoScheduleProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Live recognized text preview with real-time diacritics and clarity */}
          <div className="p-3.5 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-inner">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                <span>Reconhecimento ao Vivo:</span>
                {hasDetectedSpeech && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </span>

              {isSpeechValid ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Nitidez Alta</span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium">
                  {isSpeaking ? 'Ouvindo...' : 'Aguardando fala'}
                </span>
              )}
            </div>

            <p className="text-sm sm:text-base text-white font-semibold break-words leading-relaxed min-h-[1.75rem]">
              {speechTranscript ? (
                <span className="text-emerald-300">
                  "{speechTranscript}"
                  {interimSpokenText && (
                    <span className="text-slate-400 font-normal italic ml-1">
                      {interimSpokenText}...
                    </span>
                  )}
                </span>
              ) : (
                <span className="italic text-slate-400 font-normal">
                  Fale claramente o que você precisa fazer e o horário (ex: "Hoje às 15 horas tomar remédio")...
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Confirmation / Error feedback banner */}
      {feedbackMessage && (
        <div
          className={`mt-3 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs animate-in fade-in slide-in-from-top-1 ${
            feedbackMessage.type === 'sucesso'
              ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
          }`}
        >
          {feedbackMessage.type === 'sucesso' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-white">
              {feedbackMessage.type === 'sucesso' ? 'Lembrete Confirmado!' : 'Aviso do Sistema'}
            </p>
            <p className="text-[11px] mt-0.5 text-slate-300 leading-relaxed">{feedbackMessage.text}</p>
          </div>
        </div>
      )}
    </section>
  );
};
