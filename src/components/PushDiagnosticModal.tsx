import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Play,
  Wrench,
  Smartphone,
  BatteryCharging,
  ShieldCheck,
  Send,
  Lock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  HelpCircle,
  Laptop,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  runPushDiagnostic,
  repairPushSubscription,
  type DiagnosticCheck,
  type DiagnosticReport,
} from '../utils/pushDiagnostic';
import { useUser } from '../context/UserContext';
import { useReminders } from '../context/RemindersContext';
import { soundAlert } from '../utils/audioAlert';

interface PushDiagnosticModalProps {
  onClose: () => void;
}

export const PushDiagnosticModal: React.FC<PushDiagnosticModalProps> = ({ onClose }) => {
  const { currentUser } = useUser();
  const { testPushNotification, testPushDelayed } = useReminders();

  const [activeTab, setActiveTab] = useState<'script' | 'guia' | 'bateria'>('script');
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isDelayedTesting, setIsDelayedTesting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  // Auto-run diagnostic on modal open
  useEffect(() => {
    executeDiagnostic();
  }, [currentUser?.id]);

  const executeDiagnostic = async () => {
    setIsRunning(true);
    setRepairResult(null);
    setTestResult(null);
    try {
      const result = await runPushDiagnostic(currentUser?.id || 'guest', (updatedCheck) => {
        setReport((prev) => {
          if (!prev) return prev;
          const newChecks = prev.checks.map((c) => (c.id === updatedCheck.id ? updatedCheck : c));
          return { ...prev, checks: newChecks };
        });
      });
      setReport(result);
    } catch (err: any) {
      console.error('[PushDiagnostic] Erro durante diagnóstico:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRepair = async () => {
    if (!currentUser?.id) return;
    setIsRepairing(true);
    setRepairResult(null);
    try {
      soundAlert.startBackgroundKeepAlive();
      const res = await repairPushSubscription(currentUser.id);
      setRepairResult(res);
      if (res.success) {
        soundAlert.playSuccess();
        // Reexecutar verificação após reparo
        await executeDiagnostic();
      }
    } catch (err: any) {
      setRepairResult({
        success: false,
        message: err?.message || 'Falha ao reparar inscrição.',
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const handleImmediateTest = async () => {
    setTestResult(null);
    try {
      soundAlert.startBackgroundKeepAlive();
      const res = await testPushNotification();
      setTestResult(res);
      if (res.success) soundAlert.playChime();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Erro ao disparar teste.',
      });
    }
  };

  const handleDelayedTest = async () => {
    setTestResult(null);
    setIsDelayedTesting(true);
    setCountdown(5);
    try {
      soundAlert.startBackgroundKeepAlive();
      const res = await testPushDelayed(5);
      setTestResult(res);
      if (res.success) soundAlert.playChime();

      let sec = 5;
      const interval = setInterval(() => {
        sec -= 1;
        if (sec <= 0) {
          clearInterval(interval);
          setCountdown(null);
          setIsDelayedTesting(false);
        } else {
          setCountdown(sec);
        }
      }, 1000);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Erro ao agendar teste.',
      });
      setIsDelayedTesting(false);
      setCountdown(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Cpu className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Diagnóstico de Push & Service Worker
                </h2>
                {report && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      report.overallStatus === 'healthy'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : report.overallStatus === 'degraded'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {report.overallStatus === 'healthy' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        100% Operacional
                      </>
                    ) : report.overallStatus === 'degraded' ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        Atenção Necessária
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-rose-400" />
                        Ajuste Necessário
                      </>
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Validação ponta a ponta para disparo em nuvem com tela bloqueada e app fechado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2 shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('script')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
              activeTab === 'script'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900/90'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Script de Verificação</span>
          </button>
          <button
            onClick={() => setActiveTab('guia')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
              activeTab === 'guia'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900/90'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Guia Passo a Passo</span>
          </button>
          <button
            onClick={() => setActiveTab('bateria')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
              activeTab === 'bateria'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900/90'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <BatteryCharging className="w-3.5 h-3.5" />
            <span>Bateria & Segundo Plano</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: SCRIPT DE VERIFICAÇÃO */}
          {activeTab === 'script' && (
            <div className="space-y-4">
              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={executeDiagnostic}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>{isRunning ? 'Testando...' : 'Executar Verificação'}</span>
                  </button>

                  <button
                    onClick={handleRepair}
                    disabled={isRepairing || isRunning}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white text-xs font-bold transition border border-slate-700 cursor-pointer disabled:opacity-50"
                    title="Renova o registro no PushManager e sincroniza com o servidor"
                  >
                    {isRepairing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>Corrigir & Reinscrever</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImmediateTest}
                    disabled={isRunning || isDelayedTesting}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold transition border border-slate-700 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Testar Agora</span>
                  </button>

                  <button
                    onClick={handleDelayedTest}
                    disabled={isRunning || isDelayedTesting}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isDelayedTesting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Bloqueie a tela ({countdown}s)</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Tela Bloqueada (5s)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Repair Result Banner */}
              {repairResult && (
                <div
                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                    repairResult.success
                      ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/40'
                      : 'bg-rose-950/40 text-rose-200 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {repairResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{repairResult.message}</span>
                  </div>
                  <button
                    onClick={() => setRepairResult(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Test Result Banner */}
              {testResult && (
                <div
                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/40'
                      : 'bg-rose-950/40 text-rose-200 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  <button
                    onClick={() => setTestResult(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Checkpoint List (8 pontos) */}
              <div className="space-y-2">
                {report?.checks.map((check) => {
                  const isExpanded = expandedCheckId === check.id;
                  return (
                    <div
                      key={check.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        check.status === 'success'
                          ? 'bg-slate-900/80 border-emerald-500/25 hover:border-emerald-500/40'
                          : check.status === 'warning'
                          ? 'bg-amber-950/20 border-amber-500/35 hover:border-amber-500/50'
                          : check.status === 'error'
                          ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
                          : check.status === 'running'
                          ? 'bg-indigo-950/20 border-indigo-500/40 animate-pulse'
                          : 'bg-slate-900/40 border-slate-800'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between gap-2 cursor-pointer select-none"
                        onClick={() =>
                          setExpandedCheckId(isExpanded ? null : check.id)
                        }
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {check.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : check.status === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : check.status === 'error' ? (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          ) : check.status === 'running' ? (
                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white block truncate">
                              {check.title}
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              {check.detail || check.description}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {check.latencyMs !== undefined && (
                            <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                              {check.latencyMs}ms
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              check.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : check.status === 'warning'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : check.status === 'error'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : check.status === 'running'
                                ? 'bg-indigo-500/10 text-indigo-400'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {check.status === 'success'
                              ? 'OK'
                              : check.status === 'warning'
                              ? 'Aviso'
                              : check.status === 'error'
                              ? 'Falha'
                              : check.status === 'running'
                              ? '...'
                              : 'Pendente'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                      </div>

                      {/* Expanded description & remediation */}
                      {isExpanded && (
                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-xs text-slate-300 space-y-1.5 leading-relaxed animate-in fade-in">
                          <p className="text-slate-400">{check.description}</p>
                          {check.detail && (
                            <p className="font-mono text-[11px] text-indigo-300 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80 break-all">
                              {check.detail}
                            </p>
                          )}
                          {check.remediation && (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <span className="font-bold">Ação recomendada: </span>
                                <span>{check.remediation}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Technical Details Accordion */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <button
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    Inspecionar Metadados da Inscrição (Criptografia & Endpoint)
                  </span>
                  {showTechnicalDetails ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showTechnicalDetails && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] font-mono space-y-2 text-slate-400 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500">Service Worker Scope:</span>
                      <span className="text-slate-200 break-all">
                        {report?.subscriptionDetails?.swScope || '/'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500">Status do Worker:</span>
                      <span className="text-emerald-400 font-bold">
                        {report?.subscriptionDetails?.swState || 'active'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500">Push Endpoint (Gateway de Notificação):</span>
                      <span className="text-indigo-300 break-all">
                        {report?.subscriptionDetails?.endpoint || 'Nenhum endpoint ativo ainda.'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block">Chave p256dh:</span>
                        <span className="text-slate-300 break-all">
                          {report?.subscriptionDetails?.p256dh || 'N/A'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block">Auth Secret:</span>
                        <span className="text-slate-300 break-all">
                          {report?.subscriptionDetails?.auth || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: GUIA PASSO A PASSO */}
          {activeTab === 'guia' && (
            <div className="space-y-4 text-xs">
              {/* Android Guide */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Smartphone className="w-4 h-4" />
                  <span>Configuração no Celular Android (Chrome, Samsung Internet, Edge)</span>
                </div>

                <ol className="space-y-3 text-slate-300 list-decimal list-inside leading-relaxed pl-1">
                  <li className="pl-1">
                    <strong className="text-white">Conceder Permissão de Notificação:</strong>
                    <p className="text-slate-400 pl-4 mt-0.5">
                      Toque no botão <span className="text-emerald-300 font-bold">"Ativar Alertas no Celular"</span> no banner principal e toque em <span className="text-white font-bold">"Permitir"</span>. Se você já havia clicado em "Bloquear" por engano, toque no ícone de <strong>Cadeado / Ajustes</strong> ao lado do endereço do site e redefina "Notificações" para "Permitir".
                    </p>
                  </li>

                  <li className="pl-1">
                    <strong className="text-white">Ajustar Bateria para "Sem Restrições":</strong>
                    <p className="text-slate-400 pl-4 mt-0.5">
                      Vá em <em>Configurações do Android &gt; Aplicativos &gt; Chrome (ou Lembrete Inteligente) &gt; Bateria</em> e selecione a opção <strong className="text-emerald-300">"Sem restrições"</strong> (ou "Não otimizado"). Isso impede o Android de adiar a chegada das notificações push quando a tela está apagada há algum tempo.
                    </p>
                  </li>

                  <li className="pl-1">
                    <strong className="text-white">Instalar o Aplicativo (PWA):</strong>
                    <p className="text-slate-400 pl-4 mt-0.5">
                      Toque no menu de três pontos do navegador e escolha <span className="text-indigo-300 font-bold">"Instalar aplicativo"</span> ou <span className="text-indigo-300 font-bold">"Adicionar à tela inicial"</span>. Isso integra o aplicativo aos alarmes e sons de alta prioridade do Android.
                    </p>
                  </li>

                  <li className="pl-1">
                    <strong className="text-white">Permissão de "Alarmes e Lembretes" (Android 13+):</strong>
                    <p className="text-slate-400 pl-4 mt-0.5">
                      No Android 13 ou superior, certifique-se de que a opção "Alarmes e lembretes" em <em>Configurações &gt; Aplicativos &gt; Acesso especial &gt; Alarmes</em> esteja permitida para o navegador ou PWA.
                    </p>
                  </li>
                </ol>
              </div>

              {/* iOS Guide */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Smartphone className="w-4 h-4" />
                  <span>Configuração no iPhone / iPad (iOS 16.4 ou superior)</span>
                </div>

                <div className="text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    A Apple exige que aplicativos web sejam adicionados à tela de início antes de poderem enviar notificações push:
                  </p>
                  <ol className="space-y-2 text-slate-400 list-decimal list-inside pl-1">
                    <li>Abra o site no navegador <strong>Safari</strong>.</li>
                    <li>Toque no botão <strong>Compartilhar</strong> (ícone com quadrado e seta para cima).</li>
                    <li>Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.</li>
                    <li>Abra o aplicativo pelo novo ícone criado na tela inicial.</li>
                    <li>Toque em <strong>"Ativar Alertas"</strong> e confirme o pedido de autorização do iOS.</li>
                  </ol>
                </div>
              </div>

              {/* Desktop Guide */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
                  <Laptop className="w-4 h-4" />
                  <span>Computadores (Windows, macOS e Linux)</span>
                </div>

                <div className="text-slate-300 space-y-2 leading-relaxed">
                  <p className="text-slate-400">
                    No desktop, as notificações aparecem no canto inferior da tela (Windows) ou superior (macOS):
                  </p>
                  <ul className="space-y-1.5 text-slate-400 list-disc list-inside pl-1">
                    <li>Certifique-se de que o <strong>Assistente de Foco</strong> (Windows) ou o modo <strong>Foco / Não Perturbe</strong> (macOS) não estejam bloqueando notificações silenciosamente.</li>
                    <li>No Windows, verifique se as notificações do Google Chrome estão ativadas em <em>Configurações do Windows &gt; Sistema &gt; Notificações</em>.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BATERIA & SEGUNDO PLANO */}
          {activeTab === 'bateria' && (
            <div className="space-y-4 text-xs leading-relaxed">
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <BatteryCharging className="w-5 h-5 text-emerald-400" />
                  <span>Por que o consumo de bateria mostra 0,00% no Android?</span>
                </div>
                <p className="text-slate-300">
                  <strong className="text-white">Isso é um indicador de excelência técnica!</strong> O Lembrete Inteligente utiliza a moderna arquitetura <em>Cloud-Triggered Web Push</em>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-rose-300 block mb-1">Como apps antigos faziam:</span>
                    <p className="text-slate-400 text-[11px]">
                      Mantêm um processo pesado rodando ininterruptamente na memória RAM, esquentando o aparelho e drenando 15% a 30% da sua bateria ao longo do dia.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30">
                    <span className="font-bold text-emerald-300 block mb-1">Como nosso sistema funciona:</span>
                    <p className="text-slate-300 text-[11px]">
                      Nosso servidor em nuvem monitora o relógio atômico segundo a segundo. Seu celular fica 100% em repouso absoluto. No minuto exato, os servidores da Google (FCM) acordam o chip de rádio do aparelho para soar o alarme com vibração máxima.
                    </p>
                  </div>
                </div>
              </div>

              {/* Troubleshooting FAQ */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <HelpCircle className="w-4 h-4 text-indigo-400" />
                  <span>Dúvidas Frequentes & Resolução de Problemas</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-slate-200">
                      O alarme não vibrou com a tela bloqueada. O que fazer?
                    </h4>
                    <p className="text-slate-400 mt-0.5">
                      1. Toque no botão <strong className="text-white">"Corrigir & Reinscrever"</strong> nesta tela para renovar as chaves criptográficas.<br />
                      2. Certifique-se de que o aparelho não está no modo silencioso total ou "Não Perturbe".<br />
                      3. Nas configurações do Android, confirme que as notificações do app estão marcadas como "Permitir som e vibração".
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80">
                    <h4 className="font-bold text-slate-200">
                      O alarme continuará funcionando se eu reiniciar o celular?
                    </h4>
                    <p className="text-slate-400 mt-0.5">
                      Sim! Como a inscrição Push fica registrada nos servidores da Google Play Services e no banco em nuvem, assim que o celular ligar e conectar à internet, ele receberá os disparos normalmente.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80">
                    <h4 className="font-bold text-slate-200">
                      Preciso estar com o aplicativo aberto o tempo todo?
                    </h4>
                    <p className="text-slate-400 mt-0.5">
                      Não. Você pode fechar todas as abas do navegador ou encerrar o aplicativo na lista de tarefas recentes; o Service Worker em nuvem continuará enviando os alertas nos horários programados.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">VAPID RFC 8292 & Service Worker Push API</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
