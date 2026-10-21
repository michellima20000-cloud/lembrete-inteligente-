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
  Volume2,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import {
  cleanSpokenTranscript,
  formatTranscriptPretty,
  isOnlyTemporalQuery,
} from '../utils/reminderParser';
import { soundAlert } from '../utils/audioAlert';

interface VoiceAndTextInputProps {
  onOpenManualModal: () => void;
}

export const VoiceAndTextInput: React.FC<VoiceAndTextInputProps> = ({ onOpenManualModal }) => {
  const { processAiCommand, isProcessingAi } = useReminders();

  const [inputText, setInputText] = useState('');
  const [selectedAntecedencia, setSelectedAntecedencia] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [autoScheduleCountdown, setAutoScheduleCountdown] = useState<number | null>(null);
  const [autoScheduleProgress, setAutoScheduleProgress] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);

  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const latestTranscriptRef = useRef<string>('');
  const isAutoSchedulingRef = useRef<boolean>(false);

  // Clear countdown intervals safely
  const clearCountdown = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setAutoScheduleCountdown(null);
    setAutoScheduleProgress(0);
  }, []);

  // Submit and schedule reminder
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
          text: `Você informou apenas a data ou horário ("${clean}"). Fale também a tarefa, por exemplo: "${clean} tomar remédio".`,
        });
        return;
      }

      if (isAutoSchedulingRef.current) return;
      isAutoSchedulingRef.current = true;
      clearCountdown();

      // Stop speech recognition cleanly
      isRecordingRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsRecording(false);

      try {
        const result = await processAiCommand({
          texto: clean,
          antecedenciaPadrao: selectedAntecedencia,
        });

        setInputText('');
        setSpeechTranscript('');
        latestTranscriptRef.current = '';
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
    [processAiCommand, selectedAntecedencia, inputText, clearCountdown]
  );

  // Auto-schedule triggered after brief natural silence when speech has a valid sentence
  const handleTranscriptActivity = useCallback(
    (currentTranscript: string) => {
      clearCountdown();

      const words = currentTranscript.trim().split(/\s+/);
      // Only start auto-countdown if transcript has at least 2 words and isn't just "hoje"
      if (words.length < 2 || isOnlyTemporalQuery(currentTranscript)) {
        return;
      }

      // Quick 1.4-second silence window: hands-free automatic scheduling!
      const TOTAL_MS = 1400;
      const STEP_MS = 50;
      let elapsed = 0;

      setAutoScheduleCountdown(1);
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

  // Initialize native Browser Web Speech Recognition with high clarity settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pt-BR';
        recognition.maxAlternatives = 3;

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            const text = item[0]?.transcript || '';
            if (item.isFinal) {
              finalTranscript += (finalTranscript ? ' ' : '') + text;
            } else {
              interimTranscript += (interimTranscript ? ' ' : '') + text;
            }
          }

          const combined = (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
          const pretty = formatTranscriptPretty(combined);

          if (pretty) {
            latestTranscriptRef.current = pretty;
            setSpeechTranscript(pretty);
            setInputText(pretty);
            handleTranscriptActivity(pretty);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') {
            // User paused quietly; if we already have a valid transcript, auto-schedule!
            if (
              isRecordingRef.current &&
              latestTranscriptRef.current &&
              latestTranscriptRef.current.trim().split(/\s+/).length >= 2 &&
              !isOnlyTemporalQuery(latestTranscriptRef.current) &&
              !isAutoSchedulingRef.current
            ) {
              scheduleReminderText(latestTranscriptRef.current);
            }
            return;
          }
          if (event.error === 'aborted') {
            return;
          }

          console.warn('Speech recognition notice:', event.error);
          if (event.error === 'not-allowed') {
            setIsRecording(false);
            isRecordingRef.current = false;
            clearCountdown();
            setFeedbackMessage({
              type: 'erro',
              text: 'Permissão de microfone negada. Conceda permissão no navegador ou digite o texto.',
            });
          }
        };

        recognition.onend = () => {
          // If browser completed recognition naturally and we have a valid sentence: auto-schedule!
          if (isRecordingRef.current && !isAutoSchedulingRef.current) {
            const text = latestTranscriptRef.current;
            if (text && text.trim().split(/\s+/).length >= 2 && !isOnlyTemporalQuery(text)) {
              scheduleReminderText(text);
              return;
            }

            // Otherwise, keep listening if recording mode is still active
            setTimeout(() => {
              if (isRecordingRef.current && recognitionRef.current && !isAutoSchedulingRef.current) {
                try {
                  recognitionRef.current.start();
                } catch {
                  setIsRecording(false);
                  isRecordingRef.current = false;
                  clearCountdown();
                }
              }
            }, 250);
          } else {
            setIsRecording(false);
            isRecordingRef.current = false;
            clearCountdown();
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      clearCountdown();
    };
  }, [clearCountdown, handleTranscriptActivity, scheduleReminderText]);

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

  const startVoiceCapture = () => {
    setFeedbackMessage(null);
    clearCountdown();
    isAutoSchedulingRef.current = false;
    setSpeechTranscript('');
    latestTranscriptRef.current = '';

    if (!recognitionRef.current) {
      setFeedbackMessage({
        type: 'erro',
        text: 'Seu navegador não suporta reconhecimento de voz direto. Digite seu lembrete no campo abaixo.',
      });
      return;
    }

    try {
      isRecordingRef.current = true;
      setIsRecording(true);
      recognitionRef.current.start();
    } catch (e) {
      console.warn('Erro ao iniciar reconhecimento:', e);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const stopVoiceCaptureAndSchedule = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    clearCountdown();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const textToSchedule = formatTranscriptPretty(latestTranscriptRef.current || inputText);
    scheduleReminderText(textToSchedule);
  };

  const cancelVoiceCapture = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    clearCountdown();
    setSpeechTranscript('');
    latestTranscriptRef.current = '';
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
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
    <section className="bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl backdrop-blur-md">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-400">
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>Comando por Voz ou Texto</span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider">
                Automático
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Fale e o lembrete é compreendido e agendado sozinho</span>
            </p>
          </div>
        </div>

        <button
          onClick={onOpenManualModal}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-indigo-300 py-1 px-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 transition cursor-pointer"
          title="Agendamento manual por data e hora"
        >
          <Sliders className="w-3 h-3 text-indigo-400" />
          Manual
        </button>
      </div>

      {/* Main Input Box */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative rounded-2xl bg-slate-800/90 border border-slate-700 focus-within:border-indigo-500 transition shadow-inner">
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              latestTranscriptRef.current = e.target.value;
            }}
            placeholder='Fale no microfone ou digite: "Hoje às 15h tomar remédio" ou "Pagar conta amanhã às 10h"...'
            disabled={isProcessingAi}
            className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none resize-none disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {/* Bottom Bar inside Input */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-slate-700/40">
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
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition shrink-0 cursor-pointer ${
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
                disabled={isProcessingAi}
                className={`relative p-2.5 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/50 scale-105 ring-2 ring-rose-400/50'
                    : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900 active:scale-95'
                }`}
                title={isRecording ? 'Clique para agendar imediatamente' : 'Falar comando no microfone'}
              >
                {isRecording ? <MicOff className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
                {isRecording && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                )}
              </button>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessingAi || !inputText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
              >
                {isProcessingAi ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Agendando...</span>
                  </>
                ) : (
                  <>
                    <span>Agendar</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Recording in progress overlay bar with live waveform and automatic scheduling countdown */}
      {isRecording && (
        <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-slate-800/95 border-2 border-rose-500/70 shadow-2xl text-xs text-rose-200 animate-in fade-in space-y-3">
          {/* Top Row: Status + Audio Equalizer + Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>

              {/* Equalizer Waveform Bars */}
              <div className="flex items-center gap-1 h-6 px-1">
                <span className="w-1 bg-rose-400 rounded-full animate-soundbar-1" />
                <span className="w-1 bg-amber-400 rounded-full animate-soundbar-2" />
                <span className="w-1 bg-emerald-400 rounded-full animate-soundbar-3" />
                <span className="w-1 bg-indigo-400 rounded-full animate-soundbar-4" />
                <span className="w-1 bg-pink-400 rounded-full animate-soundbar-5" />
                <span className="w-1 bg-cyan-400 rounded-full animate-soundbar-6" />
                <span className="w-1 bg-rose-400 rounded-full animate-soundbar-7" />
              </div>

              <div>
                <span className="font-bold text-white tracking-wide text-xs">
                  Ouvindo com Alta Nitidez ({recordingSeconds}s)
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">
                  Agendamento 100% automático ao terminar de falar
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={cancelVoiceCapture}
                className="text-[11px] text-slate-400 hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-slate-700/60 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={stopVoiceCaptureAndSchedule}
                disabled={!hasDetectedSpeech}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer active:scale-95 flex items-center gap-1.5"
                title="Agendar imediatamente sem aguardar silêncio"
              >
                <span>Agendar Agora</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Automatic Scheduling Indicator & Fluid Progress Bar */}
          {autoScheduleCountdown !== null && isSpeechValid && (
            <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                  <span>Fala compreendida! Agendando automaticamente...</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-200">
                  {autoScheduleProgress}%
                </span>
              </div>
              {/* Animated Progress Bar */}
              <div className="w-full bg-slate-900/80 h-1.5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 h-full rounded-full transition-all duration-75 ease-linear shadow-sm"
                  style={{ width: `${autoScheduleProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Live recognized text preview with real-time diacritics and clarity */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/70">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <span>Leitura ao Vivo da Sua Fala:</span>
                {hasDetectedSpeech && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                )}
              </span>

              {isSpeechValid && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Nítido</span>
                </span>
              )}
            </div>

            <p className="text-sm sm:text-base text-slate-100 font-medium break-words leading-relaxed min-h-[1.5rem]">
              {speechTranscript ? (
                <span className="text-white font-semibold">"{speechTranscript}"</span>
              ) : (
                <span className="italic text-slate-500">
                  Fale claramente o que você precisa fazer e quando...
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
              ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/70 border border-rose-500/40 text-rose-200'
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
            <p className="text-[11px] mt-0.5 text-slate-300">{feedbackMessage.text}</p>
          </div>
        </div>
      )}
    </section>
  );
};
