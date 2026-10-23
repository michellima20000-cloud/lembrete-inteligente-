import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { GoogleGenAI } from '@google/genai';
import { parseReminderCommand } from './src/utils/reminderParser.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// CORS & Preflight OPTIONS handler to prevent 405 Method Not Allowed on cross-origin/PWA requests
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Initialize persistent VAPID keys for Web Push Notifications
const VAPID_FILE = path.join(__dirname, '.vapid-keys.json');
let vapidKeys: { publicKey: string; privateKey: string };

if (fs.existsSync(VAPID_FILE)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
  } catch {
    vapidKeys = webpush.generateVAPIDKeys();
    try { fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2)); } catch {}
  }
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  try { fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2)); } catch {}
}

webpush.setVapidDetails(
  'mailto:contato@lembrete-inteligente.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface Lembrete {
  id: string;
  user_id: string;
  titulo: string;
  data_hora_execucao: string; // ISO AAAA-MM-DDTHH:MM:SS
  timestamp_execucao?: number; // Absolute UTC Epoch Milliseconds
  timezone_offset_minutes?: number; // Timezone offset in minutes
  antecedencia_minutos: number; // 0, 5, 10, 15, 30
  status_tarefa: 'pendente' | 'concluído' | 'adiado';
  categoria?: string;
  urgencia?: 'baixa' | 'media' | 'alta';
  criado_em: string;
  adiado_vezes?: number;
  notificado_em?: number;
}

export interface UserProfile {
  id: string;
  nome: string;
  email?: string;
  avatarCor: string;
  criado_em: string;
}

// Multi-User Data Store strictly keyed by authenticated user ID (Firebase UID)
const userLembretes = new Map<string, Lembrete[]>();
const userProfiles = new Map<string, UserProfile>();
const userPushSubscriptions = new Map<string, webpush.PushSubscription[]>();

// Persistent Cache for push subscriptions and reminders across server restarts
const DATA_CACHE_FILE = path.join(__dirname, '.push-data-cache.json');

function loadCache() {
  try {
    if (fs.existsSync(DATA_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_CACHE_FILE, 'utf-8'));
      if (parsed.userPushSubscriptions) {
        for (const [k, v] of Object.entries(parsed.userPushSubscriptions)) {
          userPushSubscriptions.set(k, v as webpush.PushSubscription[]);
        }
      }
      if (parsed.userLembretes) {
        for (const [k, v] of Object.entries(parsed.userLembretes)) {
          userLembretes.set(k, v as Lembrete[]);
        }
      }
      console.log(`[Cache] Dados restaurados do cache persistente para ${userPushSubscriptions.size} usuário(s) push.`);
    }
  } catch (e) {
    console.warn('[Cache] Falha ao carregar cache de dados:', e);
  }
}

function saveCache() {
  try {
    const data = {
      userPushSubscriptions: Object.fromEntries(userPushSubscriptions.entries()),
      userLembretes: Object.fromEntries(userLembretes.entries()),
    };
    fs.writeFileSync(DATA_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

loadCache();

// API: Get or Sync User Profile
app.get('/api/users', (req: Request, res: Response) => {
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string);
  if (userId) {
    const profile = userProfiles.get(userId);
    return res.json({ status: 'sucesso', user: profile || null });
  }
  res.json({ status: 'sucesso', users: Array.from(userProfiles.values()) });
});

// API: Register or update authenticated user profile
app.post('/api/users', (req: Request, res: Response) => {
  const { id, nome, email, avatarCor } = req.body;
  if (!id || !nome) {
    return res.status(400).json({ status: 'erro', mensagem: 'ID e Nome do usuário são obrigatórios.' });
  }

  const user: UserProfile = {
    id: id.trim(),
    nome: nome.trim(),
    email: email ? email.trim() : undefined,
    avatarCor: avatarCor || '#4f46e5',
    criado_em: new Date().toISOString(),
  };

  userProfiles.set(user.id, user);
  if (!userLembretes.has(user.id)) {
    userLembretes.set(user.id, []);
  }

  res.json({ status: 'sucesso', user });
});

// API: Strict Isolated Reminders for authenticated user
app.get('/api/reminders', (req: Request, res: Response) => {
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string);
  if (!userId) {
    return res.status(401).json({
      status: 'erro',
      mensagem: 'Acesso negado: user_id obrigatório para isolamento multi-conta.',
    });
  }

  const items = userLembretes.get(userId) || [];
  // Sort strictly in chronological order (closest to farthest)
  const sorted = [...items].sort((a, b) => {
    return new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime();
  });

  res.json({
    status: 'sucesso',
    user_id: userId,
    lembretes: sorted,
  });
});

// API: Save Reminder for authenticated user
app.post('/api/reminders', (req: Request, res: Response) => {
  const {
    user_id,
    titulo,
    data_hora_execucao,
    antecedencia_minutos,
    categoria,
    urgencia,
    timestamp_execucao,
    timezone_offset_minutes,
  } = req.body;

  if (!user_id || !titulo || !data_hora_execucao) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'user_id, titulo e data_hora_execucao são obrigatórios.',
    });
  }

  const calculatedTs = timestamp_execucao
    ? Number(timestamp_execucao)
    : new Date(data_hora_execucao).getTime();

  const newReminder: Lembrete = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    user_id,
    titulo: titulo.trim(),
    data_hora_execucao,
    timestamp_execucao: !isNaN(calculatedTs) ? calculatedTs : Date.now(),
    timezone_offset_minutes:
      timezone_offset_minutes !== undefined ? Number(timezone_offset_minutes) : undefined,
    antecedencia_minutos: Number(antecedencia_minutos) || 0,
    status_tarefa: 'pendente',
    categoria: categoria || 'Geral',
    urgencia: urgencia || 'media',
    criado_em: new Date().toISOString(),
    adiado_vezes: 0,
  };

  const list = userLembretes.get(user_id) || [];
  list.push(newReminder);
  userLembretes.set(user_id, list);
  saveCache();

  res.json({
    status: 'sucesso',
    user_id: user_id,
    lembrete: newReminder,
    mensagem_sistema: 'Lembrete agendado com sucesso e isolado para o perfil do usuário.',
  });
});

// API: Update Reminder Status or Details (Concluir, Adiar, etc.)
app.patch('/api/reminders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string) || req.body.user_id;

  if (!userId) {
    return res.status(401).json({ status: 'erro', mensagem: 'user_id obrigatório.' });
  }

  const list = userLembretes.get(userId) || [];
  const index = list.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ status: 'erro', mensagem: 'Lembrete não encontrado para este usuário.' });
  }

  const item = list[index];
  const {
    status_tarefa,
    data_hora_execucao,
    antecedencia_minutos,
    adiar_minutos,
    titulo,
    categoria,
    urgencia,
    timestamp_execucao,
  } = req.body;

  if (status_tarefa) {
    item.status_tarefa = status_tarefa;
  }

  if (adiar_minutos) {
    const min = Number(adiar_minutos) || 10;
    const currentExecTime = Number(item.timestamp_execucao) || new Date(item.data_hora_execucao).getTime();
    const baseTime = currentExecTime > Date.now() ? currentExecTime : Date.now();
    const newExecTime = baseTime + min * 60 * 1000;
    const newExec = new Date(newExecTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    item.data_hora_execucao = `${newExec.getFullYear()}-${pad(newExec.getMonth() + 1)}-${pad(newExec.getDate())}T${pad(newExec.getHours())}:${pad(newExec.getMinutes())}:${pad(newExec.getSeconds())}`;
    item.timestamp_execucao = newExecTime;
    item.status_tarefa = 'adiado';
    item.adiado_vezes = (item.adiado_vezes || 0) + 1;
  } else if (data_hora_execucao) {
    item.data_hora_execucao = data_hora_execucao;
    item.timestamp_execucao = timestamp_execucao ? Number(timestamp_execucao) : new Date(data_hora_execucao).getTime();
  }

  if (antecedencia_minutos !== undefined) {
    item.antecedencia_minutos = Number(antecedencia_minutos);
  }
  if (titulo) item.titulo = titulo;
  if (categoria) item.categoria = categoria;
  if (urgencia) item.urgencia = urgencia;

  list[index] = item;
  userLembretes.set(userId, list);
  saveCache();

  res.json({
    status: 'sucesso',
    user_id: userId,
    lembrete: item,
    mensagem_sistema: item.status_tarefa === 'adiado'
      ? `Lembrete adiado com sucesso por ${req.body.adiar_minutos || 10} minutos.`
      : 'Lembrete atualizado com sucesso.',
  });
});

// API: Delete Reminder
app.delete('/api/reminders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string);

  if (!userId) {
    return res.status(401).json({ status: 'erro', mensagem: 'user_id obrigatório.' });
  }

  const list = userLembretes.get(userId) || [];
  const filtered = list.filter((item) => item.id !== id);
  userLembretes.set(userId, filtered);
  saveCache();

  res.json({
    status: 'sucesso',
    user_id: userId,
    mensagem_sistema: 'Lembrete removido com sucesso.',
  });
});

// API: Natural Language Reminder Parser
app.post('/api/lembrete/parse', (req: Request, res: Response) => {
  const {
    user_id,
    texto,
    currentLocalTime,
    referenceTimestamp,
    timezoneOffsetMinutes,
    timezone_offset_minutes,
    antecedencia_padrao,
  } = req.body;

  if (!user_id) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'user_id obrigatório para isolamento e segurança.',
    });
  }

  if (!texto || !texto.trim()) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Nenhum texto fornecido para processamento do lembrete.',
    });
  }

  const referenceTime = currentLocalTime || new Date().toISOString();
  const effectiveRefTimestamp = referenceTimestamp ? Number(referenceTimestamp) : Date.now();
  const effectiveOffset = timezone_offset_minutes !== undefined ? Number(timezone_offset_minutes) : (timezoneOffsetMinutes !== undefined ? Number(timezoneOffsetMinutes) : undefined);

  // Process text deterministically via shared parser
  const parsedData = parseReminderCommand({
    texto: texto.trim(),
    referenceTime,
    referenceTimestamp: effectiveRefTimestamp,
    timezoneOffsetMinutes: effectiveOffset,
    user_id,
    antecedencia_padrao,
  });

  if (parsedData.status === 'erro') {
    return res.status(400).json({
      status: 'erro',
      user_id,
      mensagem: parsedData.mensagem_sistema,
      mensagem_sistema: parsedData.mensagem_sistema,
    });
  }

  // Automatically persist to the user's isolated list
  const newReminder: Lembrete = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    user_id,
    titulo: parsedData.lembrete.titulo,
    data_hora_execucao: parsedData.lembrete.data_hora_execucao,
    timestamp_execucao: parsedData.lembrete.timestamp_execucao,
    timezone_offset_minutes: parsedData.lembrete.timezone_offset_minutes,
    antecedencia_minutos: Number(parsedData.lembrete.antecedencia_minutos) || 0,
    status_tarefa: 'pendente',
    categoria: parsedData.lembrete.categoria,
    urgencia: parsedData.lembrete.urgencia,
    criado_em: new Date().toISOString(),
    adiado_vezes: 0,
  };

  const userItems = userLembretes.get(user_id) || [];
  userItems.push(newReminder);
  userLembretes.set(user_id, userItems);
  saveCache();

  return res.json({
    status: 'sucesso',
    user_id,
    lembrete: {
      ...newReminder,
    },
    mensagem_sistema: parsedData.mensagem_sistema,
  });
});

// API: High-Accuracy Multimodal Audio Transcription with Portuguese Speech Optimization
app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { audio, mimeType } = req.body;

  if (!audio) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Nenhum dado de áudio foi recebido para transcrição.',
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      status: 'erro',
      mensagem: 'Chave GEMINI_API_KEY não configurada no servidor.',
    });
  }

  try {
    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audio,
      },
    };

    let transcript = '';
    const modelsToTry = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              audioPart,
              {
                text: 'Transcreva todo o áudio falado com máxima fidelidade em Português do Brasil (pt-BR). Retorne SOMENTE as palavras faladas exatas, sem aspas adicionais, sem preâmbulos, sem pontuações artificiais e sem explicações.',
              },
            ],
          },
        });
        const resText = response.text ? response.text.trim() : '';
        if (resText) {
          transcript = resText;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Transcription] Model ${modelName} failed, trying next:`, err?.message || err);
      }
    }

    if (!transcript && lastError) {
      throw lastError;
    }

    // Clean any unwanted surrounding quotation marks
    transcript = transcript.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();

    return res.json({
      status: 'sucesso',
      transcript,
    });
  } catch (err: any) {
    console.error('Erro na transcrição de áudio:', err);
    return res.status(500).json({
      status: 'erro',
      mensagem: err?.message || 'Falha ao processar e transcrever o áudio.',
    });
  }
});

// ==========================================
// BACKGROUND WEB PUSH ALARMS ENGINE & ROUTES
// ==========================================

// 1. Get VAPID Public Key for client subscription (GET and POST, resilient trailing slash)
app.all(['/api/push/vapid-public-key', '/api/push/vapid-public-key/'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.json({
    status: 'sucesso',
    publicKey: vapidKeys.publicKey,
  });
});

// 2. Register / Update Push Subscription for authenticated user (supports POST and GET query fallback)
app.all(['/api/push/subscribe', '/api/push/subscribe/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  let user_id = req.body?.user_id || (req.query.user_id as string);
  let subscription = req.body?.subscription;

  if (!subscription && req.query.subscription) {
    try {
      subscription = JSON.parse(decodeURIComponent(req.query.subscription as string));
    } catch {}
  }

  // If request has no payload (e.g. simple check or preflight), return success status
  if (!user_id || !subscription || !subscription.endpoint) {
    if (req.method === 'GET') {
      return res.json({ status: 'sucesso', mensagem: 'Endpoint push ativo e aguardando requisições.' });
    }
    return res.status(400).json({
      status: 'erro',
      mensagem: 'user_id e subscription válidos são obrigatórios.',
    });
  }

  const existing = userPushSubscriptions.get(user_id) || [];
  // Deduplicate by endpoint to avoid duplicate notifications on same device
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push(subscription);
  userPushSubscriptions.set(user_id, filtered);
  saveCache();

  console.log(`[WebPush] Inscrição salva para usuário ${user_id}. Dispositivos registrados: ${filtered.length}`);
  return res.json({
    status: 'sucesso',
    mensagem: 'Inscrição push salva com sucesso.',
  });
});

// 3. Unsubscribe push
app.all(['/api/push/unsubscribe', '/api/push/unsubscribe/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const user_id = req.body?.user_id || (req.query.user_id as string);
  const endpoint = req.body?.endpoint || (req.query.endpoint as string);

  if (user_id && endpoint) {
    const existing = userPushSubscriptions.get(user_id) || [];
    const filtered = existing.filter((s) => s.endpoint !== endpoint);
    userPushSubscriptions.set(user_id, filtered);
    saveCache();
  }
  return res.json({ status: 'sucesso' });
});

// 4. Test Background Push Notification
app.all(['/api/push/test', '/api/push/test/'], async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const user_id = req.body?.user_id || (req.query.user_id as string);
  if (!user_id) {
    return res.status(400).json({ status: 'erro', mensagem: 'user_id obrigatório.' });
  }

  const subs = userPushSubscriptions.get(user_id) || [];
  if (subs.length === 0) {
    return res.status(404).json({
      status: 'erro',
      mensagem: 'Nenhum dispositivo cadastrado para este usuário. Clique em "Ativar Notificações no Celular" primeiro.',
    });
  }

  const testPayload = JSON.stringify({
    title: '⏰ Teste de Alarme: Lembrete Inteligente',
    body: 'Parabéns! Seus alarmes em segundo plano estão 100% ativos e prontos para disparar no horário!',
    tag: 'test_' + Date.now(),
    reminderId: 'test',
    vibrate: [600, 200, 600, 200, 600, 200, 800],
    requireInteraction: true,
    url: '/',
  });

  const pushOptions: webpush.RequestOptions = {
    TTL: 0,
    urgency: 'high',
    headers: {
      Urgency: 'high',
      TTL: '0',
    },
  };

  let sentCount = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, testPayload, pushOptions);
      sentCount++;
    } catch (e: any) {
      console.warn('[WebPush] Falha ao enviar notificação de teste:', e?.message);
    }
  }

  return res.json({
    status: 'sucesso',
    mensagem: `Alarme de teste enviado para ${sentCount} dispositivo(s)!`,
  });
});

// 5. Sync active reminders to server store so server scheduler can wake background devices
app.all(['/api/reminders/sync', '/api/reminders/sync/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  let user_id = req.body?.user_id || (req.query.user_id as string);
  let lembretes = req.body?.lembretes;

  if (!lembretes && req.query.lembretes) {
    try {
      lembretes = JSON.parse(decodeURIComponent(req.query.lembretes as string));
    } catch {}
  }

  if (!user_id || !Array.isArray(lembretes)) {
    if (req.method === 'GET') {
      return res.json({ status: 'sucesso', count: (userLembretes.get(user_id || '') || []).length });
    }
    return res.status(400).json({ status: 'erro', mensagem: 'user_id e lista de lembretes são obrigatórios.' });
  }

  userLembretes.set(user_id, lembretes);
  saveCache();
  return res.json({ status: 'sucesso', count: lembretes.length });
});

// Explicit API 404 boundary: prevents unmatched /api/* requests from falling through to Vite SPA index.html
app.all(['/api', '/api/*'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(404).json({
    status: 'erro',
    mensagem: `Endpoint da API não encontrado: ${req.method} ${req.originalUrl}`,
  });
});

// JSON error-handling middleware for all API requests
app.use((err: any, req: Request, res: Response, next: any) => {
  if (req.originalUrl && req.originalUrl.startsWith('/api')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(err.status || 500).json({
      status: 'erro',
      mensagem: err.message || 'Erro interno no servidor da API.',
    });
  }
  next(err);
});

// 6. SERVER-SIDE BACKGROUND ALARM RUNNER
// Scans all registered users every 2 seconds.
// Fires real Web Push notifications even if the browser is closed or phone is locked!
const serverTriggeredReminders = new Set<string>();

async function sendBackgroundPushNotification(
  reminder: Lembrete,
  userId: string,
  subscriptions: webpush.PushSubscription[],
  isAntecedencia: boolean
) {
  if (subscriptions.length === 0) return;

  const antMin = reminder.antecedencia_minutos || 0;
  const title = isAntecedencia
    ? `⏰ AVISO PRÉVIO: ${reminder.titulo}`
    : `⏰ ALARME: ${reminder.titulo}`;

  const body = isAntecedencia
    ? `Atenção: faltam ${antMin} minutos para seu compromisso "${reminder.titulo}"!`
    : `Chegou o horário do seu compromisso: ${reminder.titulo}!`;

  console.log(`[Server Background Alarm] Disparando push (${isAntecedencia ? 'antecedência' : 'horário exato'}) para: "${reminder.titulo}" (${reminder.id})`);

  const payload = JSON.stringify({
    title,
    body,
    tag: `${reminder.id}_${isAntecedencia ? 'ant' : 'exec'}`,
    reminderId: reminder.id,
    vibrate: [600, 200, 600, 200, 600, 200, 800],
    requireInteraction: true,
    url: `/?alarm_reminder_id=${reminder.id}`,
    isAntecedencia,
  });

  const pushOptions: webpush.RequestOptions = {
    TTL: 0,
    urgency: 'high',
    headers: {
      Urgency: 'high',
      TTL: '0',
    },
  };

  const activeSubs: webpush.PushSubscription[] = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload, pushOptions);
      activeSubs.push(sub);
    } catch (err: any) {
      console.warn('[WebPush] Falha ao enviar alarme push:', err?.statusCode || err?.message);
      if (err?.statusCode !== 404 && err?.statusCode !== 410) {
        activeSubs.push(sub);
      }
    }
  }

  userPushSubscriptions.set(userId, activeSubs);
  saveCache();
}

setInterval(async () => {
  const now = Date.now();

  for (const [userId, remindersList] of userLembretes.entries()) {
    const subscriptions = userPushSubscriptions.get(userId) || [];

    for (const reminder of remindersList) {
      if (reminder.status_tarefa === 'concluído') continue;

      // Resilient resolution of execution timestamp
      let execTime = Number(reminder.timestamp_execucao);
      if (!execTime || isNaN(execTime)) {
        let rawIso = (reminder.data_hora_execucao || '').trim().replace(' ', 'T');
        if (rawIso) {
          if (/[Zz]|[+-]\d{2}(:?\d{2})?$/.test(rawIso)) {
            execTime = new Date(rawIso).getTime();
          } else if (typeof reminder.timezone_offset_minutes === 'number') {
            const asUtc = new Date(rawIso + 'Z').getTime();
            execTime = asUtc + reminder.timezone_offset_minutes * 60000;
          } else {
            execTime = new Date(rawIso).getTime();
          }
        }
      }

      if (!execTime || isNaN(execTime)) continue;

      const antMin = reminder.antecedencia_minutos || 0;

      // 1. Antecedência notification (if configured and due)
      if (antMin > 0) {
        const antecedenciaTime = execTime - antMin * 60 * 1000;
        const diffAnt = now - antecedenciaTime;
        const antKey = `ant_${reminder.id}_${antMin}_${reminder.data_hora_execucao}`;

        if (diffAnt >= 0 && diffAnt < 15 * 60 * 1000 && !serverTriggeredReminders.has(antKey)) {
          serverTriggeredReminders.add(antKey);
          await sendBackgroundPushNotification(reminder, userId, subscriptions, true);
        }
      }

      // 2. Exact Execution Time alarm (when time arrives)
      const diffExec = now - execTime;
      const execKey = `exec_${reminder.id}_${reminder.data_hora_execucao}`;

      if (diffExec >= 0 && diffExec < 24 * 60 * 60 * 1000 && !serverTriggeredReminders.has(execKey)) {
        serverTriggeredReminders.add(execKey);
        await sendBackgroundPushNotification(reminder, userId, subscriptions, false);
      }
    }
  }
}, 2000);

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  const http = await import('http');
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Lembrete Inteligente backend running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
