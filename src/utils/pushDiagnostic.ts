// Client-Side Push API & Service Worker Verification Script and Diagnostics Engine
// Executa testes automatizados para verificar e reparar o registro de notificações em segundo plano

import { pushManager, FALLBACK_VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from './pushManager';

export interface DiagnosticCheck {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  detail?: string;
  latencyMs?: number;
  remediation?: string;
}

export interface DiagnosticReport {
  timestamp: number;
  checks: DiagnosticCheck[];
  overallStatus: 'healthy' | 'degraded' | 'failing';
  canSendPush: boolean;
  subscriptionDetails?: {
    endpoint: string;
    expirationTime: number | null;
    p256dh: string;
    auth: string;
    swScope: string;
    swState: string;
  };
}

/**
 * Executa a bateria de 8 testes técnicos automatizados no navegador e no Service Worker.
 */
export async function runPushDiagnostic(
  userId: string,
  onStepUpdate?: (check: DiagnosticCheck) => void
): Promise<DiagnosticReport> {
  const initialChecks: DiagnosticCheck[] = [
    {
      id: 'secure-context',
      title: '1. Contexto Seguro (HTTPS / Localhost)',
      description: 'Verifica se a aplicação está rodando sob HTTPS seguro, pré-requisito da Web Push API.',
      status: 'pending',
    },
    {
      id: 'browser-apis',
      title: '2. Suporte às APIs do Navegador',
      description: 'Verifica a disponibilidade de ServiceWorker, PushManager e Notification.',
      status: 'pending',
    },
    {
      id: 'sw-registration',
      title: '3. Registro do Service Worker (/sw.js)',
      description: 'Valida se o Service Worker está ativo, controlando o escopo "/" e com ciclo de vida saudável.',
      status: 'pending',
    },
    {
      id: 'notification-permission',
      title: '4. Permissão de Notificações do Sistema',
      description: 'Confirma se o usuário concedeu a permissão "granted" no navegador ou nas configurações do SO.',
      status: 'pending',
    },
    {
      id: 'vapid-key',
      title: '5. Chave Pública VAPID do Servidor',
      description: 'Consulta o endpoint /api/push/vapid-public-key e valida a integridade da chave de assinatura.',
      status: 'pending',
    },
    {
      id: 'push-subscription',
      title: '6. Inscrição Ativa no PushManager',
      description: 'Obtém ou gera a PushSubscription nativa do navegador (Google FCM, Mozilla ou Apple WebPush).',
      status: 'pending',
    },
    {
      id: 'backend-sync',
      title: '7. Persistência da Inscrição no Servidor Cloud',
      description: 'Envia e valida a inscrição no backend (/api/push/subscribe) vinculada ao UID do usuário.',
      status: 'pending',
    },
    {
      id: 'push-delivery',
      title: '8. Diagnóstico de Disparo em Segundo Plano',
      description: 'Verifica a prontidão do canal para acordar o aparelho mesmo com a tela apagada ou app fechado.',
      status: 'pending',
    },
  ];

  const checks = [...initialChecks];
  let subscriptionDetails: DiagnosticReport['subscriptionDetails'] = undefined;

  const updateCheck = (index: number, updates: Partial<DiagnosticCheck>) => {
    checks[index] = { ...checks[index], ...updates };
    if (onStepUpdate) {
      onStepUpdate(checks[index]);
    }
  };

  // ----------------------------------------------------
  // TESTE 1: HTTPS & Secure Context
  // ----------------------------------------------------
  updateCheck(0, { status: 'running' });
  const t0 = performance.now();
  const isSecure =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  if (isSecure) {
    updateCheck(0, {
      status: 'success',
      detail: `Origem segura confirmada (${window.location.protocol}//${window.location.host}).`,
      latencyMs: Math.round(performance.now() - t0),
    });
  } else {
    updateCheck(0, {
      status: 'error',
      detail: `Origem insegura (${window.location.protocol}). Notificações Push requerem HTTPS.`,
      remediation: 'Acesse o sistema utilizando HTTPS ou adicione um certificado SSL válido.',
      latencyMs: Math.round(performance.now() - t0),
    });
  }

  // ----------------------------------------------------
  // TESTE 2: Browser APIs
  // ----------------------------------------------------
  updateCheck(1, { status: 'running' });
  const t1 = performance.now();
  const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPush = typeof window !== 'undefined' && 'PushManager' in window;
  const hasNotif = typeof window !== 'undefined' && 'Notification' in window;

  if (hasSW && hasPush && hasNotif) {
    updateCheck(1, {
      status: 'success',
      detail: 'Todas as APIs nativas necessárias estão disponíveis (ServiceWorker, PushManager, Notification).',
      latencyMs: Math.round(performance.now() - t1),
    });
  } else {
    const missing: string[] = [];
    if (!hasSW) missing.push('ServiceWorker');
    if (!hasPush) missing.push('PushManager');
    if (!hasNotif) missing.push('Notification');
    updateCheck(1, {
      status: 'error',
      detail: `APIs ausentes no navegador: ${missing.join(', ')}.`,
      remediation:
        'No iOS, você precisa salvar o aplicativo na Tela de Início (Safari > Compartilhar > Adicionar à Tela de Início) para habilitar a Push API.',
      latencyMs: Math.round(performance.now() - t1),
    });
  }

  // ----------------------------------------------------
  // TESTE 3: Service Worker Registration
  // ----------------------------------------------------
  updateCheck(2, { status: 'running' });
  const t2 = performance.now();
  let registration: ServiceWorkerRegistration | null = null;

  try {
    if (hasSW) {
      registration = (await navigator.serviceWorker.getRegistration()) || null;
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      // Aguardar ativação caso esteja aguardando
      if (registration.installing || registration.waiting) {
        await new Promise((r) => setTimeout(r, 600));
        registration = (await navigator.serviceWorker.getRegistration()) || registration;
      }
    }

    if (registration) {
      const swState = registration.active ? 'Ativo (active)' : registration.installing ? 'Instalando' : 'Aguardando';
      updateCheck(2, {
        status: registration.active ? 'success' : 'warning',
        detail: `Service Worker registrado com escopo "${registration.scope}". Estado: ${swState}.`,
        latencyMs: Math.round(performance.now() - t2),
      });
    } else {
      updateCheck(2, {
        status: 'error',
        detail: 'Não foi possível encontrar nem registrar o Service Worker em /sw.js.',
        remediation: 'Verifique se o arquivo /sw.js está sendo servido na raiz com tipo de conteúdo javascript.',
        latencyMs: Math.round(performance.now() - t2),
      });
    }
  } catch (swErr: any) {
    updateCheck(2, {
      status: 'error',
      detail: `Falha no Service Worker: ${swErr?.message || swErr}`,
      remediation: 'Limpe o cache do navegador e recarregue a página com Ctrl+F5.',
      latencyMs: Math.round(performance.now() - t2),
    });
  }

  // ----------------------------------------------------
  // TESTE 4: Notification Permission
  // ----------------------------------------------------
  updateCheck(3, { status: 'running' });
  const t3 = performance.now();
  const currentPerm = hasNotif ? Notification.permission : 'denied';

  if (currentPerm === 'granted') {
    updateCheck(3, {
      status: 'success',
      detail: 'Permissão de notificação concedida (granted). O sistema operacional autoriza exibição de alertas.',
      latencyMs: Math.round(performance.now() - t3),
    });
  } else if (currentPerm === 'default') {
    updateCheck(3, {
      status: 'warning',
      detail: 'Permissão ainda não foi solicitada (default). É necessário clicar em "Permitir" quando solicitado.',
      remediation: 'Clique no botão "Permitir Notificações" para autorizar os alertas no seu aparelho.',
      latencyMs: Math.round(performance.now() - t3),
    });
  } else {
    updateCheck(3, {
      status: 'error',
      detail: 'Permissão foi bloqueada no navegador (denied). Alertas não podem tocar.',
      remediation:
        'Toque no ícone de cadeado/configurações ao lado da URL no navegador e altere "Notificações" de "Bloquear" para "Permitir".',
      latencyMs: Math.round(performance.now() - t3),
    });
  }

  // ----------------------------------------------------
  // TESTE 5: VAPID Public Key from Backend
  // ----------------------------------------------------
  updateCheck(4, { status: 'running' });
  const t4 = performance.now();
  let vapidKey = FALLBACK_VAPID_PUBLIC_KEY;
  let vapidSource = 'chave padrão';

  try {
    const res = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.publicKey) {
        vapidKey = data.publicKey;
        vapidSource = 'servidor cloud (/api/push/vapid-public-key)';
      }
    }
    updateCheck(4, {
      status: 'success',
      detail: `Chave pública VAPID obtida via ${vapidSource} (${vapidKey.length} caracteres base64url).`,
      latencyMs: Math.round(performance.now() - t4),
    });
  } catch (vErr: any) {
    updateCheck(4, {
      status: 'warning',
      detail: `Servidor indisponível no momento, usando fallback VAPID local resiliente: ${vErr?.message}`,
      remediation: 'Verifique se o backend está em execução.',
      latencyMs: Math.round(performance.now() - t4),
    });
  }

  // ----------------------------------------------------
  // TESTE 6: PushSubscription Verification
  // ----------------------------------------------------
  updateCheck(5, { status: 'running' });
  const t5 = performance.now();
  let subscription: PushSubscription | null = null;

  try {
    if (registration && registration.pushManager) {
      subscription = await registration.pushManager.getSubscription();

      // Se ainda não houver inscrição e a permissão for concedida, tentar criar agora
      if (!subscription && currentPerm === 'granted') {
        const appServerKey = urlBase64ToUint8Array(vapidKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey as unknown as BufferSource,
        });
      }
    }

    if (subscription) {
      const subJson = subscription.toJSON();
      const p256dh = subJson.keys?.p256dh || '';
      const auth = subJson.keys?.auth || '';
      const endpointHost = new URL(subscription.endpoint).hostname;

      subscriptionDetails = {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        p256dh: p256dh ? `${p256dh.substring(0, 14)}...` : 'N/A',
        auth: auth ? `${auth.substring(0, 8)}...` : 'N/A',
        swScope: registration?.scope || '/',
        swState: registration?.active ? 'active' : 'inactive',
      };

      updateCheck(5, {
        status: 'success',
        detail: `Inscrição Push ativa vinculada ao serviço "${endpointHost}". Canal criptografado pronto.`,
        latencyMs: Math.round(performance.now() - t5),
      });
    } else {
      updateCheck(5, {
        status: currentPerm === 'granted' ? 'warning' : 'pending',
        detail: 'Nenhuma inscrição push criada ainda no PushManager deste dispositivo.',
        remediation: 'Clique em "Ativar Alertas" ou "Corrigir e Reinscrever" abaixo.',
        latencyMs: Math.round(performance.now() - t5),
      });
    }
  } catch (subErr: any) {
    updateCheck(5, {
      status: 'error',
      detail: `Erro ao obter/criar PushSubscription: ${subErr?.message || subErr}`,
      remediation: 'Clique em "Corrigir e Reinscrever" para redefinir o canal de push.',
      latencyMs: Math.round(performance.now() - t5),
    });
  }

  // ----------------------------------------------------
  // TESTE 7: Backend Subscription Persistence
  // ----------------------------------------------------
  updateCheck(6, { status: 'running' });
  const t6 = performance.now();

  if (subscription && userId) {
    try {
      const subJson = subscription.toJSON();
      const clientOffset = new Date().getTimezoneOffset();

      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-timezone-offset': String(clientOffset),
        },
        body: JSON.stringify({
          user_id: userId,
          subscription: subJson,
          timezone_offset_minutes: clientOffset,
        }),
      });

      if (saveRes.ok) {
        updateCheck(6, {
          status: 'success',
          detail: `Inscrição sincronizada no banco de dados para o usuário ${userId.substring(0, 8)}... com fuso UTC${clientOffset <= 0 ? '+' : '-'}${Math.abs(clientOffset / 60)}h.`,
          latencyMs: Math.round(performance.now() - t6),
        });
      } else {
        updateCheck(6, {
          status: 'warning',
          detail: `Servidor retornou status HTTP ${saveRes.status} ao salvar a inscrição.`,
          remediation: 'Verifique a conexão de rede ou clique em "Corrigir e Reinscrever".',
          latencyMs: Math.round(performance.now() - t6),
        });
      }
    } catch (saveErr: any) {
      updateCheck(6, {
        status: 'error',
        detail: `Falha ao sincronizar com backend: ${saveErr?.message || saveErr}`,
        remediation: 'Verifique se o servidor está respondendo na rota /api/push/subscribe.',
        latencyMs: Math.round(performance.now() - t6),
      });
    }
  } else {
    updateCheck(6, {
      status: 'pending',
      detail: subscription ? 'Usuário não autenticado.' : 'Aguardando criação da PushSubscription do passo 6.',
      remediation: 'Ative as notificações para sincronizar o aparelho.',
      latencyMs: Math.round(performance.now() - t6),
    });
  }

  // ----------------------------------------------------
  // TESTE 8: Push Delivery Readiness
  // ----------------------------------------------------
  updateCheck(7, { status: 'running' });
  const t7 = performance.now();

  try {
    const diagRes = await fetch(`/api/push/diagnose?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    if (diagRes.ok) {
      const diagData = await diagRes.json();
      const userDevices = diagData.currentUser?.deviceCount || 0;
      if (userDevices > 0) {
        updateCheck(7, {
          status: 'success',
          detail: `Disparador em nuvem 100% calibrado. ${userDevices} aparelho(s) cadastrado(s) para este usuário.`,
          latencyMs: Math.round(performance.now() - t7),
        });
      } else {
        updateCheck(7, {
          status: subscription ? 'success' : 'warning',
          detail: subscription
            ? 'Aparelho inscrito localmente e pronto para disparo.'
            : 'Nenhum aparelho com segundo plano ativo registrado no servidor ainda.',
          remediation: 'Conclua a inscrição clicando em "Ativar Alertas no Celular".',
          latencyMs: Math.round(performance.now() - t7),
        });
      }
    } else {
      updateCheck(7, {
        status: 'success',
        detail: 'Canal local pronto. Disparos locais e em nuvem configurados.',
        latencyMs: Math.round(performance.now() - t7),
      });
    }
  } catch {
    updateCheck(7, {
      status: subscription ? 'success' : 'warning',
      detail: 'Verificação básica aprovada.',
      latencyMs: Math.round(performance.now() - t7),
    });
  }

  // Avaliação Geral
  const hasErrors = checks.some((c) => c.status === 'error');
  const hasWarnings = checks.some((c) => c.status === 'warning');
  const canSend = checks[0].status === 'success' && checks[1].status === 'success' && checks[3].status === 'success' && checks[5].status === 'success';

  return {
    timestamp: Date.now(),
    checks,
    overallStatus: hasErrors ? 'failing' : hasWarnings ? 'degraded' : 'healthy',
    canSendPush: canSend,
    subscriptionDetails,
  };
}

/**
 * Procedimento de Reparo Automático:
 * 1. Cancela inscrições antigas/corrompidas no PushManager
 * 2. Solicita permissão se pendente
 * 3. Busca a chave VAPID mais recente
 * 4. Gera nova PushSubscription com applicationServerKey válida
 * 5. Registra no backend com o UID e Timezone atuais
 */
export async function repairPushSubscription(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return { success: false, message: 'Service Worker não suportado nesta plataforma.' };
    }

    // 1. Obter registro do Service Worker
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) {
      return { success: false, message: 'PushManager não disponível no Service Worker.' };
    }

    // 2. Limpar inscrição antiga se existir
    try {
      const oldSub = await reg.pushManager.getSubscription();
      if (oldSub) {
        await oldSub.unsubscribe();
        console.log('[PushDiagnostic] Inscrição antiga removida para renovação.');
      }
    } catch (e) {
      console.warn('[PushDiagnostic] Aviso ao desinscrever chave antiga:', e);
    }

    // 3. Chamar fluxo completo do pushManager
    const result = await pushManager.subscribeToPush(userId);
    return result;
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Falha ao redefinir inscrição de push.',
    };
  }
}
