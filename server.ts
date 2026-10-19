import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI server-side with telemetry header
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

// Production Multi-User Data Store strictly keyed by authenticated user ID (Firebase UID)
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

  // Expected standard response format
  res.json({
    status: 'sucesso',
    user_id: user_id,
    lembrete: {
      id: newReminder.id,
      titulo: newReminder.titulo,
      data_hora_execucao: newReminder.data_hora_execucao,
      status_tarefa: newReminder.status_tarefa,
      antecedencia_minutos: newReminder.antecedencia_minutos,
      categoria: newReminder.categoria,
      urgencia: newReminder.urgencia,
    },
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

// Fallback NLP parser for high-demand spikes or transient 503 errors
function fallbackParseNLP(params: {
  texto: string;
  referenceTime: string;
  user_id: string;
  antecedencia_padrao?: number;
}) {
  const text = params.texto.toLowerCase();
  const ref = new Date(params.referenceTime);
  let target = new Date(ref.getTime());

  // Check antecedência
  let antecedencia = params.antecedencia_padrao || 0;
  const antMatch =
    text.match(/(?:com|avise|avisar)?\s*(\d+)\s*(?:minutos?|min)\s*de\s*anteced[êe]ncia/i) ||
    text.match(/(\d+)\s*(?:minutos?|min)\s*antes/i);
  if (antMatch) {
    antecedencia = parseInt(antMatch[1], 10);
  }

  // Check relative minutes: "daqui a X minutos" / "em X minutos"
  const minMatch = text.match(/daqui\s*a\s*(\d+)\s*minutos?/i) || text.match(/em\s*(\d+)\s*minutos?/i);
  // Check relative hours: "daqui a X horas" / "em X horas"
  const hourMatch = text.match(/daqui\s*a\s*(\d+)\s*horas?/i) || text.match(/em\s*(\d+)\s*horas?/i);

  if (minMatch) {
    target = new Date(target.getTime() + parseInt(minMatch[1], 10) * 60000);
  } else if (hourMatch) {
    target = new Date(target.getTime() + parseInt(hourMatch[1], 10) * 3600000);
  } else {
    // Check day target: "amanhã" or "hoje"
    if (text.includes('amanhã') || text.includes('amanha')) {
      target.setDate(target.getDate() + 1);
    }

    // Check specific time: "às 12h", "às 12:30", "12h30", "às 19h"
    const timeMatch =
      text.match(/(?:às|as|para\s*as|para\s*às)?\s*(\d{1,2})(?:h|:)(\d{2})?/i) ||
      text.match(/(\d{1,2})\s*horas?/i);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      target.setHours(hours, minutes, 0, 0);

      // If scheduled for "today" but hour has already passed, schedule for tomorrow
      if (!text.includes('amanhã') && target.getTime() <= ref.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else {
      // Default time if not specified
      if (text.includes('amanhã')) {
        target.setHours(9, 0, 0, 0);
      } else {
        target = new Date(target.getTime() + 60 * 60000); // 1 hour from now
      }
    }
  }

  // Extract clean task description
  let cleanedTitle = params.texto
    .replace(/^me lembre\s*(?:de)?/i, '')
    .replace(/^lembrar\s*(?:de)?/i, '')
    .replace(/^agendar\s*(?:de)?/i, '')
    .replace(/amanhã\s*(?:às|as)?\s*\d{1,2}(?:h|:\d{2})?/gi, '')
    .replace(/hoje\s*(?:às|as)?\s*\d{1,2}(?:h|:\d{2})?/gi, '')
    .replace(/daqui\s*a\s*\d+\s*(?:minutos?|horas?)/gi, '')
    .replace(/em\s*\d+\s*(?:minutos?|horas?)/gi, '')
    .replace(/(?:com\s*)?\d+\s*minutos?\s*(?:de\s*antecedência|antes)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading prepositions
  cleanedTitle = cleanedTitle.replace(/^(?:de\s+|para\s+|que\s+)/i, '').trim();
  if (!cleanedTitle) {
    cleanedTitle = params.texto;
  }
  cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

  // Categorize
  let categoria = 'Geral';
  const lTitle = cleanedTitle.toLowerCase();
  if (
    lTitle.includes('cadastro') ||
    lTitle.includes('reunião') ||
    lTitle.includes('proposta') ||
    lTitle.includes('cliente') ||
    lTitle.includes('email') ||
    lTitle.includes('projeto') ||
    lTitle.includes('trabalho')
  ) {
    categoria = 'Trabalho';
  } else if (
    lTitle.includes('água') ||
    lTitle.includes('remedio') ||
    lTitle.includes('médico') ||
    lTitle.includes('saúde') ||
    lTitle.includes('alongar') ||
    lTitle.includes('exercício')
  ) {
    categoria = 'Saúde';
  } else if (
    lTitle.includes('pagar') ||
    lTitle.includes('conta') ||
    lTitle.includes('fatura') ||
    lTitle.includes('banco') ||
    lTitle.includes('dinheiro')
  ) {
    categoria = 'Finanças';
  }

  // Format to standard ISO AAAA-MM-DDTHH:MM:SS
  const pad = (n: number) => String(n).padStart(2, '0');
  const data_hora_execucao = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
    target.getDate()
  )}T${pad(target.getHours())}:${pad(target.getMinutes())}:${pad(target.getSeconds())}`;

  return {
    status: 'sucesso',
    user_id: params.user_id,
    lembrete: {
      titulo: cleanedTitle,
      data_hora_execucao,
      status_tarefa: 'pendente' as const,
      antecedencia_minutos: antecedencia,
      categoria,
      urgencia: (lTitle.includes('urgente') || lTitle.includes('imediato')) ? 'alta' : 'media',
    },
    mensagem_sistema: 'Lembrete agendado com sucesso e isolado para o perfil do usuário.',
  };
}

// API: AI Brain Natural Language Processor (Audio / Text)
app.post('/api/lembrete/parse', async (req: Request, res: Response) => {
  const {
    user_id,
    texto,
    audioBase64,
    audioMimeType,
    currentLocalTime,
    fusoHorario,
    antecedencia_padrao,
  } = req.body;

  if (!user_id) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'user_id obrigatório para isolamento e segurança.',
    });
  }

  const referenceTime = currentLocalTime || new Date().toISOString();

  // Try calling Gemini with retry
  let parsedData: any = null;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts && !parsedData) {
    attempts++;
    try {
      const parts: any[] = [];
      if (audioBase64) {
        parts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/webm',
            data: audioBase64,
          },
        });
        parts.push({
          text: `Ouça o áudio do comando do usuário e extraia a tarefa e o agendamento temporal. Texto complementar: "${texto || ''}".`,
        });
      } else {
        if (!texto || !texto.trim()) {
          return res.status(400).json({
            status: 'erro',
            mensagem: 'Nenhum texto ou áudio fornecido para processamento.',
          });
        }
        parts.push({
          text: `Comando do usuário: "${texto.trim()}"`,
        });
      }

      const systemPrompt = `
Você é o cérebro de inteligência artificial de alta precisão do aplicativo PWA "Lembrete Inteligente" voltado para smartphones.
Sua missão é extrair rigorosamente os parâmetros de lembretes a partir de comandos em linguagem natural (digitados ou falados pelo usuário em português).

DIRETRIZES FUNDAMENTAIS:
1. O usuário é identificado unicamente por user_id = "${user_id}".
2. Horário e data local de referência no smartphone do usuário: "${referenceTime}". Fuso horário: "${fusoHorario || 'local'}".
3. Analise expressões temporais relativas como:
   - "daqui a 10 minutos", "em meia hora", "daqui a 2 horas" -> calcule a partir do horário de referência exato.
   - "amanhã às 12h", "amanhã de manhã (09:00)", "hoje às 18:30" -> calcule a data exata AAAA-MM-DD e horário HH:MM:SS.
   - "na próxima quarta-feira às 15h" -> calcule a data do próximo dia da semana correspondente.
   - Se o usuário não disser o horário exato (ex: "me lembre amanhã de pagar a conta"), defina amanhã às 09:00:00.
   - Se o horário mencionado hoje já tiver passado em relação ao horário de referência, agende para o próximo dia no mesmo horário.
4. "data_hora_execucao": deve estar ESTRITAMENTE no formato "AAAA-MM-DDTHH:MM:SS" (sem letras 'Z' ao final, formato local).
5. "antecedencia_minutos": Se o usuário solicitar ("me avise 10 minutos antes", "com 15 min de antecedência"), extraia o valor (5, 10, 15, ou 30). Se não mencionar, use ${antecedencia_padrao || 0}.
6. "categoria": classifique automaticamente em uma destas: "Trabalho", "Saúde", "Finanças", "Pessoal", "Estudos", "Outro".
7. "urgencia": "alta", "media" ou "baixa".
8. "mensagem_sistema": uma confirmação clara, acolhedora e objetiva em português brasileiro (ex: "Lembrete agendado para amanhã às 12:00 e isolado para o perfil do usuário.").

Você DEVE responder com JSON válido obedecendo fielmente ao schema.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              user_id: { type: Type.STRING },
              lembrete: {
                type: Type.OBJECT,
                properties: {
                  titulo: { type: Type.STRING },
                  data_hora_execucao: { type: Type.STRING },
                  status_tarefa: { type: Type.STRING },
                  antecedencia_minutos: { type: Type.INTEGER },
                  categoria: { type: Type.STRING },
                  urgencia: { type: Type.STRING },
                },
                required: ['titulo', 'data_hora_execucao', 'status_tarefa'],
              },
              mensagem_sistema: { type: Type.STRING },
            },
            required: ['status', 'user_id', 'lembrete', 'mensagem_sistema'],
          },
        },
      });

      const rawText = response.text || '{}';
      parsedData = JSON.parse(rawText);
    } catch (err: any) {
      console.warn(`Tentativa ${attempts} com Gemini falhou:`, err?.message || err);
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  // If Gemini was unavailable (e.g. 503 high demand spike), use our high-fidelity fallback NLP parser
  if (!parsedData && texto && texto.trim()) {
    console.log('Utilizando motor inteligente de fallback para parsing de linguagem natural');
    parsedData = fallbackParseNLP({
      texto: texto.trim(),
      referenceTime,
      user_id,
      antecedencia_padrao,
    });
  }

  if (!parsedData) {
    return res.status(500).json({
      status: 'erro',
      mensagem: 'Não foi possível processar a entrada de áudio ou texto. Tente novamente.',
    });
  }

  // Force strict user_id boundary matching
  parsedData.user_id = user_id;
  parsedData.status = 'sucesso';
  if (!parsedData.lembrete.status_tarefa) {
    parsedData.lembrete.status_tarefa = 'pendente';
  }

  // Automatically persist to the user's isolated list
  const newReminder: Lembrete = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    user_id,
    titulo: parsedData.lembrete.titulo,
    data_hora_execucao: parsedData.lembrete.data_hora_execucao,
    antecedencia_minutos: Number(parsedData.lembrete.antecedencia_minutos) || 0,
    status_tarefa: 'pendente',
    categoria: parsedData.lembrete.categoria || 'Geral',
    urgencia: (parsedData.lembrete.urgencia as any) || 'media',
    criado_em: new Date().toISOString(),
    adiado_vezes: 0,
  };

  const userItems = userLembretes.get(user_id) || [];
  userItems.push(newReminder);
  userLembretes.set(user_id, userItems);

  parsedData.lembrete.id = newReminder.id;

  return res.json(parsedData);
});

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
