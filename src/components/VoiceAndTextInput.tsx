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
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';

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
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);

  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');
  const silenceTimeoutRef = useRef<any>(null);
  const isAutoSchedulingRef = useRef<boolean>(false);

  // Auto-schedule directly from spoken text with zero clicks required
  const autoScheduleVoice = useCallback(
    async (textToSchedule: string) => {
      const clean = textToSchedule.trim();
      if (!clean || isAutoSchedulingRef.current) return;

      isAutoSchedulingRef.current = true;

      // Stop voice capture
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsRecording(false);
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }

      try {
        const result = await processAiCommand({
          texto: clean,
          antecedenciaPadrao: selectedAntecedencia,
        });

        setInputText('');
        setSpeechTranscript('');
        latestTranscriptRef.current = '';
        setFeedbackMessage({
          type: 'sucesso',
          text: result.mensagem_sistema || 'Lembrete agendado automaticamente com sucesso!',
        });
        setTimeout(() => setFeedbackMessage(null), 6000);
      } catch (err: any) {
        setFeedbackMessage({
          type: 'erro',
          text: err?.message || 'Não foi possível agendar o lembrete por voz. Tente novamente.',
        });
      } finally {
        isAutoSchedulingRef.current = false;
      }
    },
    [processAiCommand, selectedAntecedencia]
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

        recognition.onresult = (event: any) => {
          let current = '';
          for (let i = 0; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          const cleanTranscript = current.trim();
          if (cleanTranscript) {
            latestTranscriptRef.current = cleanTranscript;
            setSpeechTranscript(cleanTranscript);
            setInputText(cleanTranscript);

            // Auto-schedule trigger on natural silence (1.4s after the speaker finishes their sentence)
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
            }
            silenceTimeoutRef.current = setTimeout(() => {
              if (latestTranscriptRef.current && !isAutoSchedulingRef.current) {
                autoScheduleVoice(latestTranscriptRef.current);
              }
            }, 1400);
          }
        };

        recognition.onspeechend = () => {
          // When speech stops, schedule automatically
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          silenceTimeoutRef.current = setTimeout(() => {
            if (latestTranscriptRef.current && !isAutoSchedulingRef.current) {
              autoScheduleVoice(latestTranscriptRef.current);
            }
          }, 800);
        };

        recognition.onerror = (event: any) => {
          console.warn('Erro no reconhecimento de voz nativo:', event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
          // If stopped and there's text waiting that hasn't been scheduled yet, schedule it!
          if (latestTranscriptRef.current && !isAutoSchedulingRef.current) {
            autoScheduleVoice(latestTranscriptRef.current);
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [autoScheduleVoice]);

  // Timer for recording duration
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
    setSpeechTranscript('');
    latestTranscriptRef.current = '';

    if (!recognitionRef.current) {
      setFeedbackMessage({
        type: 'erro',
        text: 'Seu navegador não suporta a Web Speech API. Digite o lembrete no campo de texto.',
      });
      return;
    }

    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (e) {
      console.warn('Erro ao iniciar reconhecimento:', e);
      setIsRecording(false);
    }
  };

  const stopVoiceCapture = () => {
    setIsRecording(false);
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Erro ao parar reconhecimento:', e);
      }
    }
    // If user explicitly taps to stop, auto-schedule whatever was captured
    if (latestTranscriptRef.current && !isAutoSchedulingRef.current) {
      autoScheduleVoice(latestTranscriptRef.current);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSubmit = inputText.trim();
    if (!textToSubmit) return;

    if (isRecording) {
      stopVoiceCapture();
      return;
    }

    try {
      const result = await processAiCommand({
        texto: textToSubmit,
        antecedenciaPadrao: selectedAntecedencia,
      });

      setInputText('');
      setSpeechTranscript('');
      latestTranscriptRef.current = '';
      setFeedbackMessage({
        type: 'sucesso',
        text: result.mensagem_sistema || 'Lembrete agendado e salvo com sucesso no Firebase!',
      });
      setTimeout(() => setFeedbackMessage(null), 6000);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'erro',
        text: err?.message || 'Não foi possível agendar o lembrete. Tente novamente.',
      });
    }
  };

  return (
    <section className="bg-slate-900/60 rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl backdrop-blur-sm">
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
              <span>Agendamento automático ao falar &bull; Sem necessidade de clicar</span>
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
            onChange={(e) => setInputText(e.target.value)}
            placeholder='Fale no microfone para agendar direto, ou digite: "Lembrar amanhã às 14h de pagar o boleto"...'
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
              {/* Voice button (Native Web Speech API with Auto-Schedule) */}
              <button
                type="button"
                onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                disabled={isProcessingAi}
                className={`relative p-2.5 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 scale-105 animate-pulse'
                    : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900 active:scale-95'
                }`}
                title={isRecording ? 'Parar e agendar' : 'Falar comando (agenda automaticamente)'}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
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

      {/* Recording in progress overlay bar */}
      {isRecording && (
        <div className="mt-2.5 p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between text-xs text-rose-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="font-semibold">Ouvindo... ({recordingSeconds}s)</span>
            <span className="text-[11px] text-rose-300/80 truncate max-w-[200px]">
              {speechTranscript || 'Fale seu lembrete agora...'}
            </span>
          </div>
          <button
            onClick={() => autoScheduleVoice(speechTranscript || latestTranscriptRef.current)}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] shadow hover:bg-rose-500 transition cursor-pointer"
          >
            Agendar Agora
          </button>
        </div>
      )}

      {/* Confirmation / Error feedback banner */}
      {feedbackMessage && (
        <div
          className={`mt-2.5 p-3 rounded-2xl flex items-start gap-2.5 text-xs animate-in fade-in slide-in-from-top-1 ${
            feedbackMessage.type === 'sucesso'
              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
          }`}
        >
          {feedbackMessage.type === 'sucesso' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {feedbackMessage.type === 'sucesso' ? 'Lembrete Confirmado' : 'Aviso do Sistema'}
            </p>
            <p className="text-[11px] mt-0.5 text-slate-300">{feedbackMessage.text}</p>
          </div>
        </div>
      )}
    </section>
  );
};
