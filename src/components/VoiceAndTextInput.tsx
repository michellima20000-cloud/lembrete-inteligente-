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
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [autoScheduleCountdown, setAutoScheduleCountdown] = useState<number | null>(null);
  const [autoScheduleProgress, setAutoScheduleProgress] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);

  // References to preserve state across async closures and speech callbacks
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
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

  // Cleanup all audio and speech recognition hardware tracks
  const stopHardwareStreams = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch {}
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    setAudioVolume(0);
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
          text: `Você informou apenas a data ou horário ("${clean}"). Fale também a tarefa, por exemplo: "${clean} tomar remédio".`,
        });
        return;
      }

      if (isAutoSchedulingRef.current) return;
      isAutoSchedulingRef.current = true;
      clearCountdown();

      // Stop speech recognition and hardware streams cleanly
      isRecordingRef.current = false;
      setIsRecording(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      stopHardwareStreams();

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
    [processAiCommand, selectedAntecedencia, inputText, clearCountdown, stopHardwareStreams]
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

      // 1.5-second silence window: hands-free automatic scheduling!
      const TOTAL_MS = 1500;
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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [clearCountdown, stopHardwareStreams]);

  // Start Voice Capture with Dual Engine (Real-Time Web Speech + Audio Stream Visualizer + MediaRecorder Fallback)
  const startVoiceCapture = async () => {
    setFeedbackMessage(null);
    clearCountdown();
    isAutoSchedulingRef.current = false;
    setSpeechTranscript('');
    latestTranscriptRef.current = '';
    audioChunksRef.current = [];

    // 1. Request microphone access explicitly to ensure permissions and active hardware stream
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
    } catch (err: any) {
      console.warn('Erro ao acessar microfone:', err);
      setIsRecording(false);
      isRecordingRef.current = false;
      const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      setFeedbackMessage({
        type: 'erro',
        text: isDenied
          ? 'Permissão de microfone bloqueada. Por favor, libere o acesso ao microfone nas configurações do seu navegador para falar os lembretes.'
          : 'Não foi possível detectar o microfone. Verifique se o dispositivo está conectado ou digite o texto.',
      });
      return;
    }

    isRecordingRef.current = true;
    setIsRecording(true);

    // 2. Setup real-time AudioContext Analyser to monitor actual speech volume
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateAudioLevel = () => {
          if (!isRecordingRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          // Normalize volume roughly between 0 and 100
          setAudioVolume(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateAudioLevel);
        };
        updateAudioLevel();
      }
    } catch (e) {
      console.warn('Erro ao inicializar visualizador de áudio:', e);
    }

    // 3. Setup MediaRecorder for high-fidelity audio capture (guaranteed transcription fallback)
    try {
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

        const mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(250);
        mediaRecorderRef.current = mediaRecorder;
      }
    } catch (recErr) {
      console.warn('MediaRecorder not available or failed:', recErr);
    }

    // 4. Initialize fresh Native Web Speech Recognition for real-time live typing
    try {
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
          if (combined) {
            const pretty = formatTranscriptPretty(combined);
            latestTranscriptRef.current = pretty;
            setSpeechTranscript(pretty);
            setInputText(pretty);
            handleTranscriptActivity(pretty);
          }
        };

        recognition.onerror = (event: any) => {
          // 'no-speech' is common when user pauses; do not stop recording
          if (event.error === 'no-speech') {
            return;
          }
          if (event.error === 'network') {
            console.warn('Web Speech API rede indisponível; áudio será transcrito via IA Gemini ao finalizar.');
            return;
          }
          console.warn('SpeechRecognition notice:', event.error);
        };

        recognition.onend = () => {
          // If still recording and user hasn't stopped, keep recognition alive
          if (isRecordingRef.current && !isAutoSchedulingRef.current) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch (e) {
      console.warn('SpeechRecognition start error:', e);
    }
  };

  // Stop voice capture and process reminder (using real-time transcript or fallback Gemini transcription)
  const stopVoiceCaptureAndSchedule = async () => {
    if (!isRecordingRef.current && !isRecording) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    clearCountdown();

    // 1. Stop SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    // 2. Stop MediaRecorder and grab audio blob
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

    // 3. Stop mic tracks and audio context
    stopHardwareStreams();

    // 4. Check if live Web Speech already captured the text
    const liveText = formatTranscriptPretty(latestTranscriptRef.current || inputText).trim();
    if (liveText.length >= 2 && !isOnlyTemporalQuery(liveText)) {
      scheduleReminderText(liveText);
      return;
    }

    // 5. If Web Speech was silent or failed, use server-side Gemini audio transcription!
    const audioBlob = await audioBlobPromise;
    if (audioBlob && audioBlob.size > 2000) {
      setIsTranscribing(true);
      setFeedbackMessage({
        type: 'sucesso',
        text: 'Transcrevendo sua fala com Inteligência Artificial...',
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
      } catch (err: any) {
        console.warn('Erro ao transcrever com Gemini:', err);
      } finally {
        setIsTranscribing(false);
      }
    }

    // If still no valid text was detected
    if (!liveText) {
      setFeedbackMessage({
        type: 'erro',
        text: 'Nenhuma fala foi detectada no microfone. Verifique se o microfone está ativo e tente falar um pouco mais alto.',
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
    latestTranscriptRef.current = '';
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
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
                disabled={isProcessingAi || isTranscribing}
                className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/50 scale-105 ring-2 ring-rose-400/50'
                    : 'bg-indigo-950/90 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-900/90 hover:text-white hover:border-indigo-400 shadow-sm shadow-indigo-950/50 active:scale-95'
                }`}
                title={isRecording ? 'Clique para agendar imediatamente' : 'Falar comando no microfone'}
                aria-label="Falar comando no microfone"
              >
                {isRecording ? (
                  <MicOff className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" />
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
                className="flex items-center gap-1.5 px-4 h-11 sm:h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
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

      {/* AI Audio Transcription in progress state */}
      {isTranscribing && (
        <div className="mt-3 p-3.5 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 text-xs text-indigo-200 flex items-center gap-3 animate-in fade-in">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
          <div>
            <p className="font-bold text-white text-xs">Transcrevendo áudio com Inteligência Artificial...</p>
            <p className="text-[11px] text-indigo-300">Convertendo sua voz em texto e programando o lembrete.</p>
          </div>
        </div>
      )}

      {/* Recording in progress overlay bar with live real-time voice volume waveform and automatic scheduling countdown */}
      {isRecording && (
        <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-slate-800/95 border-2 border-rose-500/70 shadow-2xl text-xs text-rose-200 animate-in fade-in space-y-3">
          {/* Top Row: Status + Real-Time Voice Waveform + Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>

              {/* Equalizer Waveform Bars dynamically reacting to live microphone voice volume */}
              <div className="flex items-center gap-1 h-7 px-2 py-1 bg-slate-900/80 rounded-xl border border-slate-700/60">
                {[0.4, 0.7, 1.0, 0.85, 0.6, 0.9, 0.5].map((factor, idx) => {
                  const dynamicHeight = Math.max(5, Math.min(24, Math.round(audioVolume * 0.24 * factor + 5)));
                  const isActive = audioVolume > 8;
                  return (
                    <span
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        isActive ? 'bg-emerald-400 shadow-sm shadow-emerald-400/40' : 'bg-slate-600'
                      }`}
                      style={{ height: `${dynamicHeight}px` }}
                    />
                  );
                })}
              </div>

              <div>
                <span className="font-bold text-white tracking-wide text-xs flex items-center gap-1.5">
                  <span>Microfone Ativo ({recordingSeconds}s)</span>
                  {audioVolume > 8 && (
                    <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                      Voz detectada
                    </span>
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">
                  {audioVolume > 8
                    ? 'Capturando sua fala • Ao parar de falar, o agendamento é automático'
                    : 'Fale agora o lembrete desejado...'}
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
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer active:scale-95 flex items-center gap-1.5"
                title="Agendar imediatamente"
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
                  Fale claramente o que você precisa fazer e quando (ex: "hoje às 15 horas tomar remédio")...
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
