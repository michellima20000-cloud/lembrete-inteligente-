import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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

// Helper to clean spoken transcripts
function cleanSpokenTranscript(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();
  text = text.replace(/([a-zA-Z\u00C0-\u017F0-9_]+)(?:\s+\1)+(?=[^\w\u00C0-\u017F]|$)/gi, '$1');
  const words = text.split(/\s+/);
  if (words.length >= 4) {
    for (let len = Math.floor(words.length / 2); len >= 2; len--) {
      for (let i = 0; i <= words.length - len * 2; i++) {
        const chunk1 = words.slice(i, i + len).join(' ').toLowerCase();
        const chunk2 = words.slice(i + len, i + len * 2).join(' ').toLowerCase();
        if (chunk1 === chunk2) {
          words.splice(i + len, len);
          i--;
        }
      }
    }
    text = words.join(' ');
  }
  return text.trim();
}

// 100% Local & Deterministic Natural Language Regex Parser (Zero external APIs)
function parseReminderCommandLocal(params: {
  texto: string;
  referenceTime: string;
  user_id: string;
  antecedencia_padrao?: number;
}) {
  const cleanInput = cleanSpokenTranscript(params.texto);
  const rawText = cleanInput.trim();
  const text = rawText.toLowerCase();

  // Parse reference time without timezone skew
  let refYear: number, refMonth: number, refDay: number, refHour: number, refMinute: number, refSec: number;
  if (params.referenceTime && params.referenceTime.includes('T')) {
    const [dPart, tPart] = params.referenceTime.split('T');
    const [y, m, d] = dPart.split('-').map(Number);
    const [h, min, s] = (tPart || '00:00:00').split(':').map(Number);
    refYear = y;
    refMonth = m - 1;
    refDay = d;
    refHour = h || 0;
    refMinute = min || 0;
    refSec = s || 0;
  } else {
    const d = new Date();
    refYear = d.getFullYear();
    refMonth = d.getMonth();
    refDay = d.getDate();
    refHour = d.getHours();
    refMinute = d.getMinutes();
    refSec = d.getSeconds();
  }

  const ref = new Date(refYear, refMonth, refDay, refHour, refMinute, refSec);
  let target = new Date(refYear, refMonth, refDay, refHour, refMinute, refSec);

  // 1. Antecedência
  let antecedencia = params.antecedencia_padrao || 0;
  const antMatch =
    text.match(/(?:com|avise|avisar)?\s*(\d+)\s*(?:minutos?|min)\s*(?:de\s*anteced[êe]ncia|antes)/i);
  if (antMatch) {
    antecedencia = parseInt(antMatch[1], 10);
  }

  // 2. Relative delays: "em X minutos", "daqui a X minutos", "meia hora"
  const minMatch = text.match(/(?:daqui\s*a|em)\s*(\d+)\s*(?:minutos?|min)\b/i);
  const hourMatch = text.match(/(?:daqui\s*a|em)\s*(\d+)\s*(?:horas?|h)\b/i);
  const halfHourMatch = text.match(/(?:daqui\s*a|em)\s*meia\s*hora\b/i);

  // Unicode-safe temporal indicators
  const isAfterTomorrow = /(?:^|[^\w\u00C0-\u017F])depois\s+de\s+amanh[ãa](?:[^\w\u00C0-\u017F]|$)/i.test(text);
  const isTomorrow = !isAfterTomorrow && /(?:^|[^\w\u00C0-\u017F])amanh[ãa](?:[^\w\u00C0-\u017F]|$)/i.test(text);
  const isToday = /(?:^|[^\w\u00C0-\u017F])hoje(?:[^\w\u00C0-\u017F]|$)/i.test(text);

  if (minMatch) {
    target = new Date(target.getTime() + parseInt(minMatch[1], 10) * 60000);
  } else if (halfHourMatch) {
    target = new Date(target.getTime() + 30 * 60000);
  } else if (hourMatch) {
    target = new Date(target.getTime() + parseInt(hourMatch[1], 10) * 3600000);
  } else {
    // 3. Day of execution
    if (isAfterTomorrow) {
      target.setDate(target.getDate() + 2);
    } else if (isTomorrow) {
      target.setDate(target.getDate() + 1);
    } else if (isToday) {
      // User explicitly specified "hoje" - must remain today!
    } else {
      // Check weekday names (segunda, terça, quarta, quinta, sexta, sábado, domingo)
      const weekDays: Record<string, number> = {
        domingo: 0,
        segunda: 1,
        'segunda-feira': 1,
        terça: 2,
        terca: 2,
        'terça-feira': 2,
        'terca-feira': 2,
        quarta: 3,
        'quarta-feira': 3,
        quinta: 4,
        'quinta-feira': 4,
        sexta: 5,
        'sexta-feira': 5,
        sábado: 6,
        sabado: 6,
      };

      for (const [dayName, dayIndex] of Object.entries(weekDays)) {
        const regex = new RegExp(`(?:^|[^\\w\\u00C0-\\u017F])(?:na\\s+|no\\s+|próxim[ao]\\s+)?${dayName}(?:[^\\w\\u00C0-\\u017F]|$)`, 'i');
        if (regex.test(text)) {
          const currentDay = ref.getDay();
          let daysDiff = dayIndex - currentDay;
          if (daysDiff <= 0) daysDiff += 7;
          target.setDate(target.getDate() + daysDiff);
          break;
        }
      }
    }

    // 4. Specific Time (e.g., "às 14h", "às 14:30", "14h30", "19:00", "às 9 e meia", "15 horas")
    const timeMatch =
      text.match(/(?:às|as|para\s*as|para\s*às)?\s*(\d{1,2})(?:h|:)(\d{2})?(?:[^\w\u00C0-\u017F]|$)/i) ||
      text.match(/(\d{1,2})\s*horas?(?:[^\w\u00C0-\u017F]|$)/i) ||
      text.match(/(?:às|as|para\s*as|para\s*às)\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);
    const halfPastMatch = text.match(/(?:às|as)\s*(\d{1,2})\s*e\s*meia(?:[^\w\u00C0-\u017F]|$)/i);

    if (halfPastMatch) {
      const h = parseInt(halfPastMatch[1], 10);
      target.setHours(h, 30, 0, 0);
    } else if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      target.setHours(hours, minutes, 0, 0);

      // Only bump to tomorrow if NOT explicitly "hoje", NOT "amanhã", and NOT "depois de amanhã"
      if (!isToday && !isTomorrow && !isAfterTomorrow && target.getTime() <= ref.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else {
      // Default time periods if no explicit hour given
      if (text.includes('de manhã') || text.includes('pela manhã') || text.includes('manha')) {
        target.setHours(9, 0, 0, 0);
      } else if (text.includes('à tarde') || text.includes('a tarde') || text.includes('pela tarde')) {
        target.setHours(14, 0, 0, 0);
      } else if (text.includes('à noite') || text.includes('a noite') || text.includes('pela noite')) {
        target.setHours(20, 0, 0, 0);
      } else if (isTomorrow || isAfterTomorrow) {
        target.setHours(9, 0, 0, 0);
      } else if (isToday) {
        const nextHour = ref.getHours() + 1;
        target.setHours(Math.min(nextHour, 23), 0, 0, 0);
      } else {
        // Default to 1 hour from current time
        target = new Date(target.getTime() + 60 * 60000);
      }
    }
  }

  // 5. Clean task title by removing command triggers and temporal words
  let cleanedTitle = rawText
    .replace(/^(?:por favor\s*,?\s*)?(?:me\s+)?lembre\s*(?:de\s+|para\s+)?/i, '')
    .replace(/^lembrar\s*(?:de\s+|para\s+)?/i, '')
    .replace(/^agendar\s*(?:uma\s+tarefa\s+de\s+|um\s+lembrete\s+de\s+|de\s+|para\s+)?/i, '')
    .replace(/^avise(?:-me)?\s*(?:de\s+|para\s+)?/i, '')
    .replace(/^n[ãa]o\s+esquecer\s*(?:de\s+|para\s+)?/i, '')
    .replace(/^criar\s+(?:um\s+)?lembrete\s*(?:de\s+|para\s+)?/i, '');

  cleanedTitle = cleanedTitle
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:às|as|para\s*as|para\s*às)?\s*\d{1,2}(?:h|:\d{2})(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])\d{1,2}\s*horas?(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:às|as)\s*\d{1,2}\s*e\s*meia(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:daqui\s*a|em)\s*\d+\s*(?:minutos?|min|horas?|h)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:daqui\s*a|em)\s*meia\s*hora(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:com|avise|avisar)?\s*\d+\s*(?:minutos?|min)\s*(?:de\s*anteced[êe]ncia|antes)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:de\s+manh[ãa]|pela\s+manh[ãa]|à\s+tarde|a\s+tarde|pela\s+tarde|à\s+noite|a\s+noite|pela\s+noite)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading prepositions left behind
  cleanedTitle = cleanedTitle.replace(/^(?:de\s+|para\s+|que\s+|em\s+|o\s+|a\s+)/i, '').trim();
  if (!cleanedTitle) {
    cleanedTitle = rawText || 'Compromisso agendado';
  }
  cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

  // 6. Category classification by keyword matching
  let categoria = 'Geral';
  const lTitle = cleanedTitle.toLowerCase();

  const trabalhoWords = ['reunião', 'reuniao', 'cliente', 'projeto', 'relatório', 'relatorio', 'proposta', 'chefe', 'apresentação', 'apresentacao', 'email', 'entrega', 'sprint', 'call', 'alinhar', 'contrato', 'empresa', 'vaga', 'entrevista', 'cadastro', 'ticket', 'trabalho'];
  const saudeWords = ['remédio', 'remedio', 'medicamento', 'água', 'agua', 'médico', 'medico', 'consulta', 'dentista', 'academia', 'treino', 'pilates', 'exame', 'vacina', 'caminhar', 'psicólogo', 'psicologo', 'terapia', 'alongar', 'dormir', 'hospital', 'saúde', 'saude'];
  const financasWords = ['pagar', 'pagamento', 'boleto', 'conta', 'fatura', 'banco', 'pix', 'transferência', 'transferencia', 'imposto', 'aluguel', 'luz', 'cartão', 'cartao', 'dinheiro', 'salário', 'salario', 'comprar'];
  const estudosWords = ['estudar', 'estudo', 'prova', 'aula', 'lição', 'licao', 'curso', 'faculdade', 'tese', 'dever', 'ler', 'livro', 'simulado', 'resumo', 'enem', 'escola'];

  if (trabalhoWords.some((w) => lTitle.includes(w))) {
    categoria = 'Trabalho';
  } else if (saudeWords.some((w) => lTitle.includes(w))) {
    categoria = 'Saúde';
  } else if (financasWords.some((w) => lTitle.includes(w))) {
    categoria = 'Finanças';
  } else if (estudosWords.some((w) => lTitle.includes(w))) {
    categoria = 'Estudos';
  }

  // 7. Urgency detection
  let urgencia: 'baixa' | 'media' | 'alta' = 'media';
  if (
    lTitle.includes('urgente') ||
    lTitle.includes('emergência') ||
    lTitle.includes('emergencia') ||
    lTitle.includes('prioridade') ||
    lTitle.includes('imediato') ||
    lTitle.includes('crítico') ||
    lTitle.includes('critico')
  ) {
    urgencia = 'alta';
  } else if (
    lTitle.includes('quando der') ||
    lTitle.includes('sem pressa') ||
    lTitle.includes('tranquilo') ||
    lTitle.includes('baixa prioridade')
  ) {
    urgencia = 'baixa';
  }

  // Format to standard ISO AAAA-MM-DDTHH:MM:SS
  const pad = (n: number) => String(n).padStart(2, '0');
  const data_hora_execucao = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
    target.getDate()
  )}T${pad(target.getHours())}:${pad(target.getMinutes())}:${pad(target.getSeconds())}`;

  const formattedHour = `${pad(target.getHours())}:${pad(target.getMinutes())}`;
  const dayDesc = isToday ? 'hoje' : isTomorrow ? 'amanhã' : isAfterTomorrow ? 'depois de amanhã' : `${pad(target.getDate())}/${pad(target.getMonth() + 1)}`;

  return {
    status: 'sucesso',
    user_id: params.user_id,
    lembrete: {
      titulo: cleanedTitle,
      data_hora_execucao,
      status_tarefa: 'pendente' as const,
      antecedencia_minutos: antecedencia,
      categoria,
      urgencia,
    },
    mensagem_sistema: `Lembrete "${cleanedTitle}" agendado com sucesso para ${dayDesc} às ${formattedHour}!`,
  };
}

// API: 100% Local Natural Language Reminder Parser (Zero AI / Zero External API cost)
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

  // Process text deterministically and locally via Regex parser
  const parsedData = parseReminderCommandLocal({
    texto: texto.trim(),
    referenceTime,
    user_id,
    antecedencia_padrao,
  });

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

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lembrete Inteligente backend running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
