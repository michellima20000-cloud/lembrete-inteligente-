import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Volume2,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { useUser } from '../context/UserContext';

interface VoiceAndTextInputProps {
  onOpenManualModal: () => void;
}

export const VoiceAndTextInput: React.FC<VoiceAndTextInputProps> = ({ onOpenManualModal }) => {
  const { processAiCommand, isProcessingAi } = useReminders();
  const { currentUser } = useUser();

  const [inputText, setInputText] = useState('');
  const [selectedAntecedencia, setSelectedAntecedencia] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'sucesso' | 'erro'; text: string } | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Quick suggestions prompt chips
  const sampleSuggestions = [
    'Me lembre amanhã às 12h de verificar o cadastro XPTO',
    'Reunião de alinhamento com a diretoria daqui a 30 minutos',
    'Lembrar daqui a 15 minutos de tomar água',
    'Pagar fatura do cartão hoje às 19:30',
  ];

  // Initialize Web Speech Recognition if available
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
          for (let i = event.resultIndex; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          setSpeechTranscript(current);
          setInputText((prev) => (prev ? prev + ' ' + current : current));
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

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

  const startVoiceCapture = async () => {
    setFeedbackMessage(null);
    setSpeechTranscript('');
    audioChunksRef.current = [];

    // Try starting audio media recorder
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(250);
      }
    } catch (err) {
      console.warn('Microphone stream error, fallback to speech recognition only:', err);
    }

    // Also start speech recognition if available
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Recognition start error:', e);
      }
    }

    setIsRecording(true);
  };

  const stopVoiceCapture = async () => {
    setIsRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Recognition stop error:', e);
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());

      // If we got audio chunks, process audio through Gemini
      setTimeout(async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 1000 && !inputText.trim()) {
          // Convert to base64 and process
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1];
            await handleSubmitWithData({
              audioBase64: base64Data,
              audioMimeType: 'audio/webm',
            });
          };
          return;
        }

        // If we captured speech text into inputText, submit directly
        if (inputText.trim()) {
          await handleSubmit();
        }
      }, 500);
    } else if (inputText.trim()) {
      await handleSubmit();
    }
  };

  const handleSubmitWithData = async (extraParams: { audioBase64?: string; audioMimeType?: string } = {}) => {
    try {
      const result = await processAiCommand({
        texto: inputText.trim() || undefined,
        audioBase64: extraParams.audioBase64,
        audioMimeType: extraParams.audioMimeType,
        antecedenciaPadrao: selectedAntecedencia,
      });

      setInputText('');
      setFeedbackMessage({
        type: 'sucesso',
        text: result.mensagem_sistema || 'Lembrete agendado com sucesso e isolado para o perfil do usuário.',
      });
      setTimeout(() => setFeedbackMessage(null), 6000);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'erro',
        text: err?.message || 'Não foi possível processar o lembrete. Tente novamente.',
      });
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    await handleSubmitWithData();
  };

  const selectSuggestion = (text: string) => {
    setInputText(text);
  };

  return (
    <section className="bg-slate-900/60 rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl backdrop-blur-sm">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-400">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Comando por Voz ou Texto
            </h2>
            <p className="text-[11px] text-slate-400">
              Cérebro IA extrai tarefa, data/hora e antecedência automaticamente
            </p>
          </div>
        </div>

        <button
          onClick={onOpenManualModal}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-indigo-300 py-1 px-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 transition"
          title="Agendamento tradicional por data e hora"
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
            placeholder='Fale ou digite: "Me lembre amanhã às 12h de verificar o cadastro XPTO"...'
            disabled={isProcessingAi || isRecording}
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
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition shrink-0 ${
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
                onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                disabled={isProcessingAi}
                className={`relative p-2.5 rounded-xl flex items-center justify-center transition-all ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 scale-105 animate-pulse'
                    : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900 active:scale-95'
                }`}
                title={isRecording ? 'Parar gravação' : 'Gravar comando de voz'}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isRecording && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                )}
              </button>

              {/* Submit AI Button */}
              <button
                type="submit"
                disabled={isProcessingAi || isRecording || !inputText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                {isProcessingAi ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processando...</span>
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
            onClick={stopVoiceCapture}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] shadow hover:bg-rose-500 transition"
          >
            Concluir Fala
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
              {feedbackMessage.type === 'sucesso' ? 'Cérebro IA Confirmado' : 'Aviso do Sistema'}
            </p>
            <p className="text-[11px] mt-0.5 text-slate-300">{feedbackMessage.text}</p>
          </div>
        </div>
      )}

      {/* Suggestion Chips */}
      <div className="mt-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <span>💡 Exemplos de Comandos Rápidos:</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {sampleSuggestions.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectSuggestion(sug)}
              className="text-left text-[11px] px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition active:scale-[0.98]"
            >
              "{sug}"
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
