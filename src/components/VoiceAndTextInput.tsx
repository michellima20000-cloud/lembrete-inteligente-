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
  Volume2,
  RefreshCw,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { cleanSpokenTranscript, isOnlyTemporalQuery } from '../utils/reminderParser';
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
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);

  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const latestTranscriptRef = useRef<string>('');
  const isAutoSchedulingRef = useRef<boolean>(false);

  // Clear countdown intervals safely
  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoScheduleCountdown(null);
  }, []);

  // Submit and schedule reminder
  const scheduleReminderText = useCallback(
    async (textToSchedule: string) => {
      const clean = cleanSpokenTranscript(textToSchedule || inputText).trim();

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
          text: 'Você informou apenas a data/horário. Por favor, complete com a tarefa (ex: "' + clean + ' tomar remédio" ou "pagar boleto ' + clean + '").',
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
          text: result.mensagem_sistema || 'Lembrete agendado com sucesso!',
        });
        setTimeout(() => setFeedbackMessage(null), 7000);
      } catch (err: any) {
        console.warn('Error scheduling reminder:', err);
        setFeedbackMessage({
          type: 'erro',
          text: err?.message || 'Não foi possível agendar o lembrete. Tente falar de forma mais clara ou digite o texto.',
        });
      } finally {
        isAutoSchedulingRef.current = false;
        setIsRecording(false);
      }
    },
    [processAiCommand, selectedAntecedencia, inputText, clearCountdown]
  );

  // Auto-schedule countdown starts only after user remains quiet AND has a complete sentence
  const handleTranscriptActivity = useCallback(
    (currentTranscript: string) => {
      clearCountdown();

      // Only consider auto-countdown if transcript is substantive (at least 3 words and not only "hoje")
      const words = currentTranscript.trim().split(/\s+/);
      if (words.length < 3 || isOnlyTemporalQuery(currentTranscript)) {
        return;
      }

      // Give 5 full seconds of calm silence so user can pause without audio breaking
      let remaining = 5;
      setAutoScheduleCountdown(remaining);

      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdown();
          if (latestTranscriptRef.current && isRecordingRef.current && !isAutoSchedulingRef.current) {
            scheduleReminderText(latestTranscriptRef.current);
          }
        } else {
          setAutoScheduleCountdown(remaining);
        }
      }, 1000);
    },
    [clearCountdown, scheduleReminderText]
  );

  // Initialize native Browser Web Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pt-BR';
        recognition.maxAlternatives = 1;

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
          const clean = cleanSpokenTranscript(combined);

          if (clean) {
            latestTranscriptRef.current = clean;
            setSpeechTranscript(clean);
            setInputText(clean);
            handleTranscriptActivity(clean);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') {
            // User paused quietly; keep listening
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
          // If browser closed stream while recording is active, safely restart with slight delay
          if (isRecordingRef.current && !isAutoSchedulingRef.current) {
            setTimeout(() => {
              if (isRecordingRef.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch {
                  setIsRecording(false);
                  isRecordingRef.current = false;
                  clearCountdown();
                }
              }
            }, 300);
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
  }, [clearCountdown, handleTranscriptActivity]);

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

    if (!recognitionRef.current) {
      setFeedbackMessage({
        type: 'erro',
        text: 'Seu navegador não suporta reconhecimento de voz direto. Digite seu lembrete no campo abaixo.',
      });
      return;
    }

    try {
      // Note: Do not play chimes before start to prevent microphone stream interruption/ducking
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

    const textToSchedule = cleanSpokenTranscript(latestTranscriptRef.current || inputText);
    scheduleReminderText(textToSchedule);
  };

  const cancelVoiceCapture = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    clearCountdown();
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

  return (
    <section className="bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl backdrop-blur-md">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-400">
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Comando por Voz ou Texto
            </h2>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Reconhecimento contínuo e preciso em Português</span>
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
            placeholder='Fale no microfone ou digite: "Hoje às 15h tomar remédio" ou "Pagar conta hoje às 18h"...'
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
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/50 scale-105'
                    : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900 active:scale-95'
                }`}
                title={isRecording ? 'Clique para concluir gravação e agendar' : 'Falar comando no microfone'}
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

      {/* Recording in progress overlay bar with live waveform and countdown */}
      {isRecording && (
        <div className="mt-3 p-3.5 rounded-2xl bg-slate-800/95 border-2 border-rose-500/60 shadow-lg text-xs text-rose-200 animate-in fade-in space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              <span className="font-bold text-white tracking-wide">Ouvindo com Precisão ({recordingSeconds}s)</span>
              {autoScheduleCountdown !== null && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold animate-pulse text-[11px]">
                  Confirmando em {autoScheduleCountdown}s...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelVoiceCapture}
                className="text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-slate-700/60 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={stopVoiceCaptureAndSchedule}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <span>Concluir e Agendar</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Live recognized text preview */}
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/70">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Leitura ao Vivo da Sua Fala:
              </span>
              {autoScheduleCountdown !== null && (
                <button
                  type="button"
                  onClick={clearCountdown}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline"
                >
                  Continuar Falando
                </button>
              )}
            </div>
            <p className="text-sm text-slate-100 font-medium break-words italic">
              {speechTranscript ? `"${speechTranscript}"` : 'Fale claramente o que você precisa fazer e quando...'}
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
