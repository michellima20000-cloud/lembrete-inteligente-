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
  antecedencia_minutos: number; // 0, 5, 10, 15, 30
  status_tarefa: 'pendente' | 'concluído' | 'adiado';
  categoria?: string;
  urgencia?: 'baixa' | 'media' | 'alta';
  criado_em: string;
  adiado_vezes?: number;
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
  const { user_id, titulo, data_hora_execucao, antecedencia_minutos, categoria, urgencia } = req.body;
  if (!user_id || !titulo || !data_hora_execucao) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'user_id, titulo e data_hora_execucao são obrigatórios.',
    });
  }

  const newReminder: Lembrete = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    user_id,
    titulo: titulo.trim(),
    data_hora_execucao,
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
  const { status_tarefa, data_hora_execucao, antecedencia_minutos, adiar_minutos, titulo, categoria, urgencia } = req.body;

  if (status_tarefa) {
    item.status_tarefa = status_tarefa;
  }

  if (adiar_minutos) {
    const min = Number(adiar_minutos) || 10;
    const currentExecTime = new Date(item.data_hora_execucao).getTime();
    const baseTime = currentExecTime > Date.now() ? currentExecTime : Date.now();
    const newExec = new Date(baseTime + min * 60 * 1000);
    item.data_hora_execucao = newExec.toISOString().slice(0, 19);
    item.status_tarefa = 'adiado';
    item.adiado_vezes = (item.adiado_vezes || 0) + 1;
  } else if (data_hora_execucao) {
    item.data_hora_execucao = data_hora_execucao;
  }

  if (antecedencia_minutos !== undefined) {
    item.antecedencia_minutos = Number(antecedencia_minutos);
  }
  if (titulo) item.titulo = titulo;
  if (categoria) item.categoria = categoria;
  if (urgencia) item.urgencia = urgencia;

  list[index] = item;
  userLembretes.set(userId, list);

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

  res.json({
    status: 'sucesso',
    user_id: userId,
    mensagem_sistema: 'Lembrete removido com sucesso.',
  });
});

// API: Natural Language Reminder Parser
app.post('/api/lembrete/parse', (req: Request, res: Response) => {
  const { user_id, texto, currentLocalTime, antecedencia_padrao } = req.body;

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

  // Process text deterministically via shared parser
  const parsedData = parseReminderCommand({
    texto: texto.trim(),
    referenceTime,
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

// 1. Get VAPID Public Key for client subscription
app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// 2. Register / Update Push Subscription for authenticated user
app.post('/api/push/subscribe', (req: Request, res: Response) => {
  const { user_id, subscription } = req.body;
  if (!user_id || !subscription || !subscription.endpoint) {
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

  console.log(`[WebPush] Inscrição salva para usuário ${user_id}. Dispositivos registrados: ${filtered.length}`);
  return res.json({
    status: 'sucesso',
    mensagem: 'Inscrição push salva com sucesso.',
  });
});

// 3. Unsubscribe push
app.post('/api/push/unsubscribe', (req: Request, res: Response) => {
  const { user_id, endpoint } = req.body;
  if (user_id && endpoint) {
    const existing = userPushSubscriptions.get(user_id) || [];
    const filtered = existing.filter((s) => s.endpoint !== endpoint);
    userPushSubscriptions.set(user_id, filtered);
  }
  return res.json({ status: 'sucesso' });
});

// 4. Test Background Push Notification
app.post('/api/push/test', async (req: Request, res: Response) => {
  const { user_id } = req.body;
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

  let sentCount = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, testPayload);
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
app.post('/api/reminders/sync', (req: Request, res: Response) => {
  const { user_id, lembretes } = req.body;
  if (!user_id || !Array.isArray(lembretes)) {
    return res.status(400).json({ status: 'erro', mensagem: 'user_id e lista de lembretes são obrigatórios.' });
  }

  userLembretes.set(user_id, lembretes);
  return res.json({ status: 'sucesso', count: lembretes.length });
});

// 6. SERVER-SIDE BACKGROUND ALARM RUNNER
// Scans all registered users every 2.5 seconds.
// Fires real Web Push notifications even if the browser is closed or phone is locked!
const serverTriggeredReminders = new Set<string>();

setInterval(async () => {
  const now = Date.now();

  for (const [userId, remindersList] of userLembretes.entries()) {
    const subscriptions = userPushSubscriptions.get(userId) || [];

    for (const reminder of remindersList) {
      if (reminder.status_tarefa === 'concluído') continue;

      const execTime = new Date(reminder.data_hora_execucao).getTime();
      const antMin = reminder.antecedencia_minutos || 0;
      const triggerTime = execTime - antMin * 60 * 1000;

      // Check if due: now has passed triggerTime and not yet triggered
      const diff = now - triggerTime;
      const triggerKey = `${reminder.id}_${reminder.data_hora_execucao}`;

      // Trigger if due (within the past 24 hours) and not yet sent
      if (diff >= 0 && diff < 24 * 60 * 60 * 1000 && !serverTriggeredReminders.has(triggerKey)) {
        serverTriggeredReminders.add(triggerKey);
        console.log(`[Server Background Alarm] Disparando alarme para: "${reminder.titulo}" (${reminder.id})`);

        if (subscriptions.length > 0) {
          const payload = JSON.stringify({
            title: `⏰ ALARME: ${reminder.titulo}`,
            body: antMin > 0
              ? `Aviso com ${antMin}m de antecedência para seu compromisso!`
              : `Chegou o horário do seu compromisso: ${reminder.titulo}!`,
            tag: reminder.id,
            reminderId: reminder.id,
            vibrate: [600, 200, 600, 200, 600, 200, 800],
            requireInteraction: true,
            url: `/?alarm_reminder_id=${reminder.id}`,
          });

          const activeSubs: webpush.PushSubscription[] = [];
          for (const sub of subscriptions) {
            try {
              await webpush.sendNotification(sub, payload);
              activeSubs.push(sub);
            } catch (err: any) {
              console.warn('[WebPush] Falha ao enviar alarme push:', err?.statusCode || err?.message);
              // Drop expired subscriptions (410 Gone / 404 Not Found)
              if (err?.statusCode !== 404 && err?.statusCode !== 410) {
                activeSubs.push(sub);
              }
            }
          }
          userPushSubscriptions.set(userId, activeSubs);
        }
      }
    }
  }
}, 2500);

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  const http = await import('http');
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: isHmrDisabled ? false : { server },
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
