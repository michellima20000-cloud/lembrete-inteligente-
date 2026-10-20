import { Lembrete, StatusTarefa } from '../types';

export interface ParseReminderInput {
  texto: string;
  referenceTime?: string;
  user_id: string;
  antecedencia_padrao?: number;
}

export interface ParseReminderResult {
  status: 'sucesso' | 'erro';
  user_id: string;
  lembrete: {
    id?: string;
    titulo: string;
    data_hora_execucao: string;
    status_tarefa: StatusTarefa;
    antecedencia_minutos?: number;
    categoria?: string;
    urgencia?: 'baixa' | 'media' | 'alta';
  };
  mensagem_sistema: string;
}

/**
 * Cleans speech transcripts by removing duplicate repeated words and phrases
 * caused by Android Chrome Web Speech API stream duplication.
 */
export function cleanSpokenTranscript(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // 1. Remove consecutive identical words (case-insensitive, unicode-safe)
  // e.g. "lembrar lembrar de de pagar" -> "lembrar de pagar"
  text = text.replace(/([a-zA-Z\u00C0-\u017F0-9_]+)(?:\s+\1)+(?=[^\w\u00C0-\u017F]|$)/gi, '$1');

  // 2. Remove repeated consecutive phrases (e.g. "pagar o boleto pagar o boleto")
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

export function parseReminderCommand(params: ParseReminderInput): ParseReminderResult {
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
  const antMatch = text.match(/(?:com|avise|avisar)?\s*(\d+)\s*(?:minutos?|min)\s*(?:de\s*anteced[êe]ncia|antes)/i);
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
      // Stays explicitly TODAY - never bump to tomorrow!
    } else {
      // Check weekday names
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

    // 4. Specific Time
    // Matches: "às 14h", "14h30", "às 14:30", "15 horas", "às 15", "para às 18h", etc.
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

      // Only bump to tomorrow if user did NOT explicitly specify "hoje", "amanhã", or "depois de amanhã"
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
        // If explicitly requested for today without specific hour, set to 1 hour from current time or max 23h
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

  const trabalhoWords = [
    'reunião', 'reuniao', 'cliente', 'projeto', 'relatório', 'relatorio',
    'proposta', 'chefe', 'apresentação', 'apresentacao', 'email', 'entrega',
    'sprint', 'call', 'alinhar', 'contrato', 'empresa', 'vaga', 'entrevista',
    'cadastro', 'ticket', 'trabalho'
  ];
  const saudeWords = [
    'remédio', 'remedio', 'medicamento', 'água', 'agua', 'médico', 'medico',
    'consulta', 'dentista', 'academia', 'treino', 'pilates', 'exame', 'vacina',
    'caminhar', 'psicólogo', 'psicologo', 'terapia', 'alongar', 'dormir',
    'hospital', 'saúde', 'saude'
  ];
  const financasWords = [
    'pagar', 'pagamento', 'boleto', 'conta', 'fatura', 'banco', 'pix',
    'transferência', 'transferencia', 'imposto', 'aluguel', 'luz', 'cartão',
    'cartao', 'dinheiro', 'salário', 'salario', 'comprar'
  ];
  const estudosWords = [
    'estudar', 'estudo', 'prova', 'aula', 'lição', 'licao', 'curso',
    'faculdade', 'tese', 'dever', 'ler', 'livro', 'simulado', 'resumo',
    'enem', 'escola'
  ];

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
      status_tarefa: 'pendente',
      antecedencia_minutos: antecedencia,
      categoria,
      urgencia,
    },
    mensagem_sistema: `Lembrete "${cleanedTitle}" agendado com sucesso para ${dayDesc} às ${formattedHour}!`,
  };
}
