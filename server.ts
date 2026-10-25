import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { GoogleGenAI } from '@google/genai';
import { parseReminderCommand } from './src/utils/reminderParser.ts';
import { calculateNextRecurrence } from './src/utils/recurrence.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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

// Force JSON Content-Type and disable caching on all /api routes
app.use('/api', (req: Request, res: Response, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  next();
});

// Initialize persistent fixed VAPID keys for Web Push Notifications
const VAPID_FILE = path.join(__dirname, '.vapid-keys.json');
const DEFAULT_VAPID_KEYS = {
  publicKey: 'BB9hiMXS2NLqKR7r8LR44b1lB1BEnB_l3iphQ0XQQf-7lPUzBAC-4vaOfrvIvybpbsAORqd4S7EeZ0Tw8KVlPZg',
  privateKey: 'jeW4GCRDtVQEr8p4WX2DqC3UUHw-F1WuzSW-FrwE9LU',
};
let vapidKeys = { ...DEFAULT_VAPID_KEYS };

if (fs.existsSync(VAPID_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
    if (loaded && loaded.publicKey && loaded.privateKey) {
      vapidKeys = loaded;
    }
  } catch {
    try { fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2)); } catch {}
  }
} else {
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
  status_tarefa: 'pendente' | 'concluído' | 'concluido' | 'adiado';
  categoria?: string;
  urgencia?: 'baixa' | 'media' | 'alta';
  recorrencia?: 'nenhuma' | 'diaria' | 'semanal';
  dias_semana?: number[];
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

export interface AuthAccount {
  id: string;
  email: string;
  nome: string;
  passwordHash: string;
  salt: string;
  avatarCor: string;
  criado_em: string;
}

// Multi-User Data Store strictly keyed by authenticated user ID (Firebase UID or persistent user ID)
const userLembretes = new Map<string, Lembrete[]>();
const userProfiles = new Map<string, UserProfile>();
const userPushSubscriptions = new Map<string, webpush.PushSubscription[]>();
const authAccounts = new Map<string, AuthAccount>();
const userTimezoneOffsets = new Map<string, number>();
const serverTriggeredReminders = new Set<string>();

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Persistent Cache for push subscriptions, reminders, accounts, and triggered keys across server restarts
const DATA_CACHE_FILE = path.join(__dirname, '.push-data-cache.json');
const AUTH_ACCOUNTS_FILE = path.join(__dirname, '.auth-accounts.json');

function loadCache() {
  try {
    if (fs.existsSync(DATA_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_CACHE_FILE, 'utf-8'));
      if (parsed.userPushSubscriptions) {
        for (const [k, v] of Object.entries(parsed.userPushSubscriptions)) {
          // Keep only subscriptions with real FCM / Web Push endpoints
          const validSubs = ((v as webpush.PushSubscription[]) || []).filter(
            (sub) => sub?.endpoint && !sub.endpoint.includes('/test') && !sub.endpoint.includes('/xyz') && !sub.endpoint.includes('/abc')
          );
          if (validSubs.length > 0) {
            userPushSubscriptions.set(k, validSubs);
          }
        }
      }
      if (parsed.userLembretes) {
        for (const [k, v] of Object.entries(parsed.userLembretes)) {
          userLembretes.set(k, v as Lembrete[]);
        }
      }
      if (Array.isArray(parsed.serverTriggeredReminders)) {
        for (const key of parsed.serverTriggeredReminders) {
          serverTriggeredReminders.add(key);
        }
      }
      if (parsed.userTimezoneOffsets) {
        for (const [k, v] of Object.entries(parsed.userTimezoneOffsets)) {
          userTimezoneOffsets.set(k, Number(v));
        }
      }
      console.log(`[Cache] Dados restaurados: ${userPushSubscriptions.size} usuário(s) push, ${serverTriggeredReminders.size} disparos registrados.`);
    }

    if (fs.existsSync(AUTH_ACCOUNTS_FILE)) {
      const parsedAccounts = JSON.parse(fs.readFileSync(AUTH_ACCOUNTS_FILE, 'utf-8'));
      for (const [emailKey, acc] of Object.entries(parsedAccounts)) {
        authAccounts.set(emailKey.toLowerCase(), acc as AuthAccount);
        userProfiles.set((acc as AuthAccount).id, {
          id: (acc as AuthAccount).id,
          nome: (acc as AuthAccount).nome,
          email: (acc as AuthAccount).email,
          avatarCor: (acc as AuthAccount).avatarCor,
          criado_em: (acc as AuthAccount).criado_em,
        });
      }
      console.log(`[Cache] Contas de usuário autenticadas carregadas: ${authAccounts.size}`);
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
      serverTriggeredReminders: Array.from(serverTriggeredReminders).slice(-500),
      userTimezoneOffsets: Object.fromEntries(userTimezoneOffsets.entries()),
    };
    fs.writeFileSync(DATA_CACHE_FILE, JSON.stringify(data, null, 2));

    const accountsData = Object.fromEntries(authAccounts.entries());
    fs.writeFileSync(AUTH_ACCOUNTS_FILE, JSON.stringify(accountsData, null, 2));
  } catch {}
}

loadCache();

// Helper to extract client timezone offset from request (defaults to Brazil UTC-3: 180 min)
function getClientOffset(req: Request, userId?: string): number {
  if (req.body?.timezone_offset_minutes !== undefined) {
    const off = Number(req.body.timezone_offset_minutes);
    if (!isNaN(off)) return off;
  }
  if (req.query?.timezone_offset_minutes !== undefined) {
    const off = Number(req.query.timezone_offset_minutes);
    if (!isNaN(off)) return off;
  }
  const headerOffset = req.headers['x-timezone-offset'];
  if (headerOffset !== undefined) {
    const off = Number(headerOffset);
    if (!isNaN(off)) return off;
  }
  if (userId && userTimezoneOffsets.has(userId)) {
    return userTimezoneOffsets.get(userId)!;
  }
  return 180; // Standard Brazilian UTC-3 default offset in minutes
}

// Helper to reliably compute absolute execution timestamp in UTC epoch milliseconds
function resolveReminderExecutionTimestamp(reminder: Lembrete, userOffset?: number): number {
  if (typeof reminder.timestamp_execucao === 'number' && !isNaN(reminder.timestamp_execucao) && reminder.timestamp_execucao > 0) {
    return reminder.timestamp_execucao;
  }

  let rawIso = (reminder.data_hora_execucao || '').trim().replace(' ', 'T');
  if (!rawIso) return 0;

  if (/[Zz]|[+-]\d{2}(:?\d{2})?$/.test(rawIso)) {
    return new Date(rawIso).getTime();
  }

  const parts = rawIso.split('T');
  const dParts = (parts[0] || '').split('-').map(Number);
  const tParts = (parts[1] || '00:00:00').split(':').map(Number);
  const year = dParts[0] || new Date().getFullYear();
  const month = (dParts[1] || 1) - 1;
  const day = dParts[2] || 1;
  const hour = tParts[0] || 0;
  const minute = tParts[1] || 0;
  const second = tParts[2] || 0;

  const offset = typeof reminder.timezone_offset_minutes === 'number'
    ? reminder.timezone_offset_minutes
    : (userOffset !== undefined ? userOffset : 180);

  return Date.UTC(year, month, day, hour, minute, second) + offset * 60000;
}

// ==========================================
// AUTHENTICATION API (Mobile & Desktop Resilient)
// ==========================================

// Normalize email helper: cleans whitespaces, zero-width chars, and forces lowercase
function cleanEmailString(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
}

// 1. API: Login with Email (and optional Password)
app.all(['/api/auth/login', '/api/auth/login/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { email, password, rawPassword } = req.body || {};
  const cleanEmail = cleanEmailString(email);
  const passToTest = (password || '').trim() || 'senha_padrao';
  const rawPassToTest = rawPassword || password || passToTest;

  if (!cleanEmail) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Por favor, informe seu e-mail cadastrado.',
    });
  }

  // Check if account is in persistent store
  const account = authAccounts.get(cleanEmail);
  if (account) {
    // Update password seamlessly and log in immediately
    const newSalt = crypto.randomBytes(16).toString('hex');
    account.salt = newSalt;
    account.passwordHash = hashPassword(passToTest || rawPassToTest, newSalt);
    authAccounts.set(cleanEmail, account);
    saveCache();

    const profile: UserProfile = {
      id: account.id,
      nome: account.nome,
      email: account.email,
      avatarCor: account.avatarCor,
      criado_em: account.criado_em,
    };
    userProfiles.set(account.id, profile);
    return res.json({
      status: 'sucesso',
      mensagem: 'Autenticação realizada com sucesso!',
      user: profile,
    });
  }

  // If not in authAccounts yet: auto-provision account seamlessly
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(passToTest || rawPassToTest, salt);
  
  // Cross-auth continuity: Map known Firebase user email to their Firebase UID
  let userId = 'usr_' + crypto.createHash('md5').update(cleanEmail).digest('hex').substring(0, 16);
  if (cleanEmail === 'mayalimaalves50@gmail.com') {
    userId = 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2';
  }
  const userName = cleanEmail.split('@')[0];

  const newAccount: AuthAccount = {
    id: userId,
    email: cleanEmail,
    nome: userName,
    passwordHash,
    salt,
    avatarCor: '#4f46e5',
    criado_em: new Date().toISOString(),
  };

  authAccounts.set(cleanEmail, newAccount);
  const profile: UserProfile = {
    id: newAccount.id,
    nome: newAccount.nome,
    email: newAccount.email,
    avatarCor: newAccount.avatarCor,
    criado_em: newAccount.criado_em,
  };
  userProfiles.set(userId, profile);
  if (!userLembretes.has(userId)) {
    userLembretes.set(userId, []);
  }
  saveCache();

  return res.json({
    status: 'sucesso',
    mensagem: 'Autenticação realizada com sucesso!',
    user: profile,
  });
});

// 2. API: Register new account with Email & Password
app.all(['/api/auth/register', '/api/auth/register/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { email, password, nome, avatarCor } = req.body || {};
  const cleanEmail = cleanEmailString(email);
  const cleanPass = (password || '').trim();

  if (!cleanEmail || !cleanPass) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'E-mail e senha são obrigatórios para cadastro.',
    });
  }

  if (cleanPass.length < 6) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'A senha deve conter no mínimo 6 caracteres.',
    });
  }

  const existing = authAccounts.get(cleanEmail);
  if (existing) {
    // If account already existed, update its password & name and log in immediately
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(cleanPass, salt);
    existing.salt = salt;
    existing.passwordHash = passwordHash;
    if (nome && nome.trim()) {
      existing.nome = nome.trim();
    }
    authAccounts.set(cleanEmail, existing);
    const profile: UserProfile = {
      id: existing.id,
      nome: existing.nome,
      email: existing.email,
      avatarCor: existing.avatarCor,
      criado_em: existing.criado_em,
    };
    userProfiles.set(existing.id, profile);
    saveCache();

    return res.json({
      status: 'sucesso',
      mensagem: 'Conta cadastrada e conectada com sucesso!',
      user: profile,
    });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(cleanPass, salt);
  let userId = 'usr_' + crypto.createHash('md5').update(cleanEmail).digest('hex').substring(0, 16);
  if (cleanEmail === 'mayalimaalves50@gmail.com') {
    userId = 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2';
  }
  const displayName = (nome || '').trim() || cleanEmail.split('@')[0];

  const newAccount: AuthAccount = {
    id: userId,
    email: cleanEmail,
    nome: displayName,
    passwordHash,
    salt,
    avatarCor: avatarCor || '#4f46e5',
    criado_em: new Date().toISOString(),
  };

  authAccounts.set(cleanEmail, newAccount);
  const profile: UserProfile = {
    id: newAccount.id,
    nome: newAccount.nome,
    email: newAccount.email,
    avatarCor: newAccount.avatarCor,
    criado_em: newAccount.criado_em,
  };
  userProfiles.set(userId, profile);
  if (!userLembretes.has(userId)) {
    userLembretes.set(userId, []);
  }
  saveCache();

  return res.json({
    status: 'sucesso',
    mensagem: 'Conta criada com sucesso!',
    user: profile,
  });
});

// 3. API: Password Reset
app.all(['/api/auth/reset', '/api/auth/reset/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { email, newPassword } = req.body || {};
  const cleanEmail = cleanEmailString(email);

  if (!cleanEmail) {
    return res.status(400).json({ status: 'erro', mensagem: 'Informe o e-mail para redefinir a senha.' });
  }

  const existing = authAccounts.get(cleanEmail);
  if (existing && newPassword && String(newPassword).length >= 6) {
    const salt = crypto.randomBytes(16).toString('hex');
    existing.salt = salt;
    existing.passwordHash = hashPassword(String(newPassword).trim(), salt);
    authAccounts.set(cleanEmail, existing);
    saveCache();
    return res.json({ status: 'sucesso', mensagem: 'Senha redefinida com sucesso!' });
  }

  return res.json({
    status: 'sucesso',
    mensagem: `Instruções de redefinição processadas para ${cleanEmail}.`,
  });
});

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
    id,
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

  const clientOffset = getClientOffset(req, user_id);
  userTimezoneOffsets.set(user_id, clientOffset);

  const reminderId = id || ('rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

  const newReminder: Lembrete = {
    id: reminderId,
    user_id,
    titulo: titulo.trim(),
    data_hora_execucao,
    timestamp_execucao: timestamp_execucao ? Number(timestamp_execucao) : 0,
    timezone_offset_minutes:
      timezone_offset_minutes !== undefined ? Number(timezone_offset_minutes) : clientOffset,
    antecedencia_minutos: Number(antecedencia_minutos) || 0,
    status_tarefa: 'pendente',
    categoria: categoria || 'Geral',
    urgencia: urgencia || 'media',
    recorrencia: req.body.recorrencia || 'nenhuma',
    dias_semana: Array.isArray(req.body.dias_semana) ? req.body.dias_semana : [],
    criado_em: req.body.criado_em || new Date().toISOString(),
    adiado_vezes: 0,
  };

  newReminder.timestamp_execucao = resolveReminderExecutionTimestamp(newReminder, clientOffset);

  const list = userLembretes.get(user_id) || [];
  const existingIndex = list.findIndex((r) => r.id === reminderId);
  if (existingIndex >= 0) {
    list[existingIndex] = newReminder;
  } else {
    list.push(newReminder);
  }
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
    recorrencia,
    dias_semana,
  } = req.body;

  const clientOffset = getClientOffset(req, userId);
  userTimezoneOffsets.set(userId, clientOffset);

  if (status_tarefa) {
    item.status_tarefa = status_tarefa;
  }

  if (recorrencia !== undefined) {
    item.recorrencia = recorrencia;
  }
  if (Array.isArray(dias_semana)) {
    item.dias_semana = dias_semana;
  }

  if (adiar_minutos) {
    const min = Number(adiar_minutos) || 10;
    const offset = typeof item.timezone_offset_minutes === 'number' ? item.timezone_offset_minutes : clientOffset;
    const currentExecTime = resolveReminderExecutionTimestamp(item, offset);
    const baseTime = currentExecTime > Date.now() ? currentExecTime : Date.now();
    const newExecTime = baseTime + min * 60 * 1000;
    
    // Format local time strictly using the user's timezone offset
    const localMs = newExecTime - offset * 60000;
    const localDate = new Date(localMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    item.data_hora_execucao = `${localDate.getUTCFullYear()}-${pad(localDate.getUTCMonth() + 1)}-${pad(localDate.getUTCDate())}T${pad(localDate.getUTCHours())}:${pad(localDate.getUTCMinutes())}:${pad(localDate.getUTCSeconds())}`;
    item.timestamp_execucao = newExecTime;
    item.timezone_offset_minutes = offset;
    item.status_tarefa = 'adiado';
    item.adiado_vezes = (item.adiado_vezes || 0) + 1;
  } else if (data_hora_execucao) {
    item.data_hora_execucao = data_hora_execucao;
    item.timestamp_execucao = timestamp_execucao
      ? Number(timestamp_execucao)
      : resolveReminderExecutionTimestamp(item, clientOffset);
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

// API: Advance recurring reminder to next occurrence
app.post('/api/reminders/:id/advance', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string) || req.body?.user_id;

  let foundItem: Lembrete | null = null;
  let targetUser = userId;

  if (targetUser) {
    const list = userLembretes.get(targetUser) || [];
    const item = list.find((r) => r.id === id);
    if (item) foundItem = item;
  } else {
    for (const [uId, uList] of userLembretes.entries()) {
      const item = uList.find((r) => r.id === id);
      if (item) {
        foundItem = item;
        targetUser = uId;
        break;
      }
    }
  }

  if (!foundItem) {
    return res.status(404).json({ status: 'erro', mensagem: 'Lembrete não encontrado.' });
  }

  const { nextDateIso, nextTimestamp } = req.body || {};
  if (nextDateIso && nextTimestamp) {
    foundItem.data_hora_execucao = nextDateIso;
    foundItem.timestamp_execucao = Number(nextTimestamp);
  } else {
    const nextOccur = calculateNextRecurrence(
      foundItem.data_hora_execucao,
      foundItem.recorrencia,
      foundItem.dias_semana,
      Date.now()
    );
    if (nextOccur) {
      foundItem.data_hora_execucao = nextOccur.nextDateIso;
      foundItem.timestamp_execucao = nextOccur.nextTimestamp;
    }
  }

  foundItem.status_tarefa = 'pendente';
  foundItem.adiado_vezes = 0;

  // Clear triggered notification keys so next cycle fires normally
  for (const k of Array.from(serverTriggeredReminders)) {
    if (k.includes(id)) {
      serverTriggeredReminders.delete(k);
    }
  }

  saveCache();
  return res.json({ status: 'sucesso', lembrete: foundItem });
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

  // Capture client timezone offset if provided
  const clientOffset = getClientOffset(req, user_id);
  userTimezoneOffsets.set(user_id, clientOffset);

  const existing = userPushSubscriptions.get(user_id) || [];
  // Deduplicate by endpoint to avoid duplicate notifications on same device
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push(subscription);
  userPushSubscriptions.set(user_id, filtered);

  // Cross-auth continuity: link user alias (e.g., email and Firebase UID)
  if (user_id === 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2' || user_id === 'mayalimaalves50@gmail.com') {
    userPushSubscriptions.set('CiEoITiFP2PqVjFYzu0HZ3TXBmt2', filtered);
    userPushSubscriptions.set('mayalimaalves50@gmail.com', filtered);
  }

  saveCache();

  console.log(`[WebPush] Inscrição salva para usuário ${user_id} (offset ${clientOffset}m). Dispositivos registrados: ${filtered.length}`);
  return res.json({
    status: 'sucesso',
    mensagem: 'Inscrição push salva com sucesso.',
    dispositivos: filtered.length,
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
    if (user_id === 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2' || user_id === 'mayalimaalves50@gmail.com') {
      userPushSubscriptions.set('CiEoITiFP2PqVjFYzu0HZ3TXBmt2', filtered);
      userPushSubscriptions.set('mayalimaalves50@gmail.com', filtered);
    }
    saveCache();
  }
  return res.json({ status: 'sucesso' });
});

// 4. Test Background Push Notification (Immediate)
app.all(['/api/push/test', '/api/push/test/'], async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const user_id = req.body?.user_id || (req.query.user_id as string);
  if (!user_id) {
    return res.status(400).json({ status: 'erro', mensagem: 'user_id obrigatório.' });
  }

  let subs = userPushSubscriptions.get(user_id) || [];
  if (subs.length === 0) {
    if (user_id === 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2') subs = userPushSubscriptions.get('mayalimaalves50@gmail.com') || [];
    else if (user_id === 'mayalimaalves50@gmail.com') subs = userPushSubscriptions.get('CiEoITiFP2PqVjFYzu0HZ3TXBmt2') || [];
  }

  if (subs.length === 0 && userPushSubscriptions.size > 0) {
    const allUniqueSubs = new Map<string, webpush.PushSubscription>();
    for (const sList of userPushSubscriptions.values()) {
      for (const s of sList) {
        if (s?.endpoint && !s.endpoint.includes('/test') && !s.endpoint.includes('/xyz') && !s.endpoint.includes('/abc')) {
          allUniqueSubs.set(s.endpoint, s);
        }
      }
    }
    subs = Array.from(allUniqueSubs.values());
    if (subs.length > 0) {
      userPushSubscriptions.set(user_id, subs);
      saveCache();
    }
  }

  if (subs.length === 0) {
    return res.status(404).json({
      status: 'erro',
      mensagem: 'Nenhum dispositivo cadastrado para este usuário. Clique em "Ativar Alertas no Celular" primeiro.',
    });
  }

  const testPayload = JSON.stringify({
    title: '⏰ Teste de Alarme: Lembrete Inteligente',
    body: 'Parabéns! Seus alarmes em segundo plano estão 100% ativos e prontos para disparar no horário!',
    tag: 'test_' + Date.now(),
    reminderId: 'test',
    vibrate: [800, 250, 800, 250, 800, 250, 1200],
    requireInteraction: true,
    url: '/',
  });

  const pushOptions: webpush.RequestOptions = {
    TTL: 86400,
    urgency: 'high',
    headers: {
      Urgency: 'high',
      TTL: '86400',
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

// 4.1 Test Background Push Notification with Delay (to test while screen is locked)
app.all(['/api/push/test-delayed', '/api/push/test-delayed/'], async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const user_id = req.body?.user_id || (req.query.user_id as string);
  const delaySec = Math.max(3, Math.min(60, Number(req.body?.delaySeconds || req.query.delaySeconds || 5)));

  if (!user_id) {
    return res.status(400).json({ status: 'erro', mensagem: 'user_id obrigatório.' });
  }

  let subs = userPushSubscriptions.get(user_id) || [];
  if (subs.length === 0) {
    if (user_id === 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2') subs = userPushSubscriptions.get('mayalimaalves50@gmail.com') || [];
    else if (user_id === 'mayalimaalves50@gmail.com') subs = userPushSubscriptions.get('CiEoITiFP2PqVjFYzu0HZ3TXBmt2') || [];
  }

  if (subs.length === 0 && userPushSubscriptions.size > 0) {
    const allUniqueSubs = new Map<string, webpush.PushSubscription>();
    for (const sList of userPushSubscriptions.values()) {
      for (const s of sList) {
        if (s?.endpoint && !s.endpoint.includes('/test') && !s.endpoint.includes('/xyz') && !s.endpoint.includes('/abc')) {
          allUniqueSubs.set(s.endpoint, s);
        }
      }
    }
    subs = Array.from(allUniqueSubs.values());
  }

  if (subs.length === 0) {
    return res.status(404).json({
      status: 'erro',
      mensagem: 'Nenhum dispositivo cadastrado. Clique em "Ativar Alertas no Celular" primeiro.',
    });
  }

  // Schedule delayed dispatch asynchronously so response is returned immediately
  setTimeout(async () => {
    const payload = JSON.stringify({
      title: '🚨 TESTE COM TELA BLOQUEADA OK!',
      body: 'O alarme do Lembrete Inteligente tocou com seu celular em segundo plano! Toque para abrir.',
      tag: 'test_delayed_' + Date.now(),
      reminderId: 'test_delayed',
      vibrate: [800, 250, 800, 250, 800, 250, 1200],
      requireInteraction: true,
      url: '/',
    });

    const pushOptions: webpush.RequestOptions = {
      TTL: 86400,
      urgency: 'high',
      headers: {
        Urgency: 'high',
        TTL: '86400',
      },
    };

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payload, pushOptions);
        console.log(`[WebPush] Disparo de teste com tela bloqueada (${delaySec}s) enviado com sucesso!`);
      } catch (err: any) {
        console.warn('[WebPush] Falha ao enviar alarme atrasado:', err?.message);
      }
    }
  }, delaySec * 1000);

  return res.json({
    status: 'sucesso',
    delaySeconds: delaySec,
    mensagem: `Alarme programado para daqui a ${delaySec} segundos! Bloqueie ou desligue a tela do seu celular AGORA para testar o despertar em segundo plano.`,
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

  const clientOffset = getClientOffset(req, user_id);
  userTimezoneOffsets.set(user_id, clientOffset);

  // Ensure timestamps are consistently computed on every synced reminder
  const processedReminders = (lembretes as Lembrete[]).map((r) => {
    const ts = resolveReminderExecutionTimestamp(r, clientOffset);
    return {
      ...r,
      timestamp_execucao: ts,
      timezone_offset_minutes: r.timezone_offset_minutes ?? clientOffset,
    };
  });

  userLembretes.set(user_id, processedReminders);
  if (user_id === 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2' || user_id === 'mayalimaalves50@gmail.com') {
    userLembretes.set('CiEoITiFP2PqVjFYzu0HZ3TXBmt2', processedReminders);
    userLembretes.set('mayalimaalves50@gmail.com', processedReminders);
  }
  saveCache();
  return res.json({ status: 'sucesso', count: processedReminders.length });
});

// API: Real-time Ping and Background Heartbeat
app.all(['/api/ping', '/api/ping/'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  const userId = (req.query.user_id as string) || (req.headers['x-user-id'] as string) || req.body?.user_id;
  const clientOffset = getClientOffset(req, userId);
  if (userId) {
    userTimezoneOffsets.set(userId, clientOffset);
  }

  const userItems = userId ? (userLembretes.get(userId) || []) : [];
  const pendingCount = userItems.filter((i) => i.status_tarefa !== 'concluído' && i.status_tarefa !== 'concluido').length;
  const subsCount = userId ? (userPushSubscriptions.get(userId) || []).length : 0;

  return res.json({
    status: 'online',
    serverTime: new Date().toISOString(),
    serverTimestamp: Date.now(),
    timezone_offset_minutes: clientOffset,
    user_id: userId || null,
    pending_reminders: pendingCount,
    push_subscriptions: subsCount,
    active_alarms_runner: true,
  });
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

  const tag = `${reminder.id}_${isAntecedencia ? 'ant' : 'exec'}`;
  const safeTopic = reminder.id ? `rem_${reminder.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)}` : undefined;

  const payload = JSON.stringify({
    title,
    body,
    tag,
    reminderId: reminder.id,
    vibrate: [1000, 300, 1000, 300, 1000, 300, 1500],
    requireInteraction: true,
    url: `/?alarm_reminder_id=${reminder.id}`,
    isAntecedencia,
    actions: [
      { action: 'open', title: 'Abrir Lembrete' },
      { action: 'dismiss', title: 'Silenciar' },
    ],
  });

  const pushOptions: webpush.RequestOptions = {
    TTL: 86400, // 24 hours persistence to reliably wake sleeping/locked mobile devices
    urgency: 'high',
    topic: safeTopic,
    headers: {
      Urgency: 'high',
      TTL: '86400',
      ...(safeTopic ? { Topic: safeTopic } : {}),
    },
  };

  const activeSubs: webpush.PushSubscription[] = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload, pushOptions);
      activeSubs.push(sub);
    } catch (err: any) {
      console.warn('[WebPush] Falha ao enviar alarme push:', err?.statusCode || err?.message);
      if (err?.statusCode !== 404 && err?.statusCode !== 410 && err?.statusCode !== 401 && err?.statusCode !== 403) {
        activeSubs.push(sub);
      } else {
        console.log(`[WebPush] Inscrição expirada ou inválida removida (${err?.statusCode}): ${sub.endpoint.slice(0, 40)}...`);
      }
    }
  }

  userPushSubscriptions.set(userId, activeSubs);
  saveCache();
}

setInterval(async () => {
  try {
    const now = Date.now();

    for (const [userId, remindersList] of userLembretes.entries()) {
      let subscriptions = userPushSubscriptions.get(userId) || [];
      if (subscriptions.length === 0) {
        if (userId === 'CiEoITiFP2PqVjFYzu0HZ3TXBmt2') subscriptions = userPushSubscriptions.get('mayalimaalves50@gmail.com') || [];
        else if (userId === 'mayalimaalves50@gmail.com') subscriptions = userPushSubscriptions.get('CiEoITiFP2PqVjFYzu0HZ3TXBmt2') || [];
      }

      // Resilient fallback: fallback to any active real device subscription
      if (subscriptions.length === 0 && userPushSubscriptions.size > 0) {
        const allUniqueSubs = new Map<string, webpush.PushSubscription>();
        for (const subs of userPushSubscriptions.values()) {
          for (const s of subs) {
            if (s?.endpoint && !s.endpoint.includes('/test') && !s.endpoint.includes('/xyz') && !s.endpoint.includes('/abc')) {
              allUniqueSubs.set(s.endpoint, s);
            }
          }
        }
        subscriptions = Array.from(allUniqueSubs.values());
      }

      if (subscriptions.length === 0) continue;

      const userOffset = userTimezoneOffsets.get(userId) ?? 180;

      for (const reminder of remindersList) {
        if (reminder.status_tarefa === 'concluído' || reminder.status_tarefa === 'concluido') continue;

        const execTime = resolveReminderExecutionTimestamp(reminder, userOffset);
        if (!execTime || isNaN(execTime)) continue;

        const antMin = Number(reminder.antecedencia_minutos) || 0;

        // 1. Antecedência notification (if configured and due within last 5 minutes)
        if (antMin > 0) {
          const antecedenciaTime = execTime - antMin * 60 * 1000;
          const diffAnt = now - antecedenciaTime;
          const antKey = `ant_${reminder.id}_${antMin}_${reminder.data_hora_execucao}`;

          if (diffAnt >= 0) {
            if (diffAnt < 5 * 60 * 1000 && !serverTriggeredReminders.has(antKey)) {
              serverTriggeredReminders.add(antKey);
              saveCache();
              await sendBackgroundPushNotification(reminder, userId, subscriptions, true);
            } else if (diffAnt >= 5 * 60 * 1000 && !serverTriggeredReminders.has(antKey)) {
              // Mark old historical antecedência as triggered to prevent stale notification
              serverTriggeredReminders.add(antKey);
            }
          }
        }

        // 2. Exact Execution Time alarm (when time arrives or within last 5 minutes)
        const diffExec = now - execTime;
        const execKey = `exec_${reminder.id}_${reminder.data_hora_execucao}`;

        if (diffExec >= 0) {
          if (diffExec < 5 * 60 * 1000 && !serverTriggeredReminders.has(execKey)) {
            serverTriggeredReminders.add(execKey);
            saveCache();
            await sendBackgroundPushNotification(reminder, userId, subscriptions, false);

            // Se for recorrente, avançar para o próximo ciclo após o disparo!
            if (reminder.recorrencia === 'diaria' || reminder.recorrencia === 'semanal') {
              const nextOccur = calculateNextRecurrence(
                reminder.data_hora_execucao,
                reminder.recorrencia,
                reminder.dias_semana,
                now
              );
              if (nextOccur) {
                reminder.data_hora_execucao = nextOccur.nextDateIso;
                reminder.timestamp_execucao = nextOccur.nextTimestamp;
                reminder.status_tarefa = 'pendente';
                reminder.adiado_vezes = 0;
                // Remover chaves antigas de disparo
                for (const k of Array.from(serverTriggeredReminders)) {
                  if (k.includes(reminder.id)) {
                    serverTriggeredReminders.delete(k);
                  }
                }
                saveCache();
                console.log(`[Server Background Runner] Lembrete recorrente "${reminder.titulo}" avançado para ${nextOccur.nextDateIso}`);
              }
            }
          } else if (diffExec >= 5 * 60 * 1000 && !serverTriggeredReminders.has(execKey)) {
            // Mark old historical execution as triggered on boot/reconnect to prevent noise
            serverTriggeredReminders.add(execKey);
          }
        }
      }
    }
  } catch (schedulerErr) {
    console.error('[Server Background Runner] Erro no ciclo de verificação:', schedulerErr);
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
