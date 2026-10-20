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
 * caused by Android Chrome Web Speech API stream duplication, while preserving
 * natural Portuguese speech phrasing.
 */
export function cleanSpokenTranscript(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // 1. Remove consecutive identical words (case-insensitive, unicode-safe)
  // e.g. "lembrar lembrar de de pagar" -> "lembrar de pagar"
  // Skip short 1-letter words like "e", "a", "o" unless 3+ times
  text = text.replace(/\b([a-zA-Z\u00C0-\u017F0-9_]{2,})(?:\s+\1)+(?=[^\w\u00C0-\u017F]|$)/gi, '$1');

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

/**
 * Normalizes spoken Portuguese numbers, colloquial times, and relative phrases
 * into crisp, standardized time formats.
 */
export function normalizeSpokenPortugueseNumbers(raw: string): string {
  if (!raw) return '';
  let text = ' ' + raw.toLowerCase() + ' ';

  // Special time expressions
  text = text.replace(/\bmeio[- ]dia e meia\b/gi, ' às 12:30 ');
  text = text.replace(/\bmeio[- ]dia e meio\b/gi, ' às 12:30 ');
  text = text.replace(/\bmeio[- ]dia\b/gi, ' às 12:00 ');
  text = text.replace(/\bmeia[- ]noite e meia\b/gi, ' às 00:30 ');
  text = text.replace(/\bmeia[- ]noite\b/gi, ' às 00:00 ');
  text = text.replace(/\bmeia[- ]hora\b/gi, ' 30 minutos ');

  // Colloquial Brazilian Portuguese "X para as Y" / "X pras Y" (e.g., 10 pras 3 -> 14:50)
  const colloquialHourMap: Record<string, number> = {
    'uma': 13, 'um': 13, '1': 13,
    'duas': 14, 'dois': 14, '2': 14,
    'três': 15, 'tres': 15, '3': 15,
    'quatro': 16, '4': 16,
    'cinco': 17, '5': 17,
    'seis': 18, '6': 18,
    'sete': 19, '7': 19,
    'oito': 20, '8': 20,
    'nove': 21, '9': 21,
    'dez': 22, '10': 22,
    'onze': 23, '11': 23,
    'doze': 12, '12': 12,
  };

  const colloquialMinMap: Record<string, number> = {
    'cinco': 5, '5': 5,
    'dez': 10, '10': 10,
    'quinze': 15, '15': 15,
    'vinte': 20, '20': 20,
    'vinte e cinco': 25, '25': 25,
  };

  for (const [minWord, minVal] of Object.entries(colloquialMinMap)) {
    for (const [hWord, hVal] of Object.entries(colloquialHourMap)) {
      const pattern = new RegExp(`\\b${minWord}\\s+(?:pras|para\\s+as|para\\s+às)\\s+${hWord}\\b`, 'gi');
      if (pattern.test(text)) {
        // e.g. 10 pras 3 (15h) = 14:50
        const prevH = (hVal - 1 + 24) % 24;
        const targetMin = 60 - minVal;
        const padH = String(prevH).padStart(2, '0');
        const padM = String(targetMin).padStart(2, '0');
        text = text.replace(pattern, ` às ${padH}:${padM} `);
      }
    }
  }

  // Afternoon hours with explicit marker
  const afternoonHours: Record<string, string> = {
    'uma': '13:00', 'um': '13:00', '1': '13:00',
    'duas': '14:00', 'dois': '14:00', '2': '14:00',
    'três': '15:00', 'tres': '15:00', '3': '15:00',
    'quatro': '16:00', '4': '16:00',
    'cinco': '17:00', '5': '17:00',
    'seis': '18:00', '6': '18:00',
  };
  for (const [w, repl] of Object.entries(afternoonHours)) {
    text = text.replace(new RegExp(`(?:às|as)?\\s*\\b${w}\\b\\s*(?:da tarde|pela tarde|de tarde)`, 'gi'), ` às ${repl} `);
  }

  // Evening hours
  const eveningHours: Record<string, string> = {
    'sete': '19:00', '7': '19:00',
    'oito': '20:00', '8': '20:00',
    'nove': '21:00', '9': '21:00',
    'dez': '22:00', '10': '22:00',
    'onze': '23:00', '11': '23:00',
  };
  for (const [w, repl] of Object.entries(eveningHours)) {
    text = text.replace(new RegExp(`(?:às|as)?\\s*\\b${w}\\b\\s*(?:da noite|pela noite|de noite)`, 'gi'), ` às ${repl} `);
  }

  // Morning hours
  const morningHours: Record<string, string> = {
    'uma': '01:00', 'um': '01:00', '1': '01:00',
    'duas': '02:00', 'dois': '02:00', '2': '02:00',
    'três': '03:00', 'tres': '03:00', '3': '03:00',
    'quatro': '04:00', '4': '04:00',
    'cinco': '05:00', '5': '05:00',
    'seis': '06:00', '6': '06:00',
    'sete': '07:00', '7': '07:00',
    'oito': '08:00', '8': '08:00',
    'nove': '09:00', '9': '09:00',
    'dez': '10:00', '10': '10:00',
    'onze': '11:00', '11': '11:00',
  };
  for (const [w, repl] of Object.entries(morningHours)) {
    text = text.replace(new RegExp(`(?:às|as)?\\s*\\b${w}\\b\\s*(?:da manhã|pela manhã|de manhã)`, 'gi'), ` às ${repl} `);
  }

  // Spoken Portuguese compound and single numbers
  const wordNumbers: Record<string, string> = {
    'cinquenta e cinco': '55',
    'cinquenta': '50',
    'quarenta e cinco': '45',
    'quarenta': '40',
    'trinta e cinco': '35',
    'trinta': '30',
    'vinte e cinco': '25',
    'vinte e quatro': '24',
    'vinte e três': '23',
    'vinte e tres': '23',
    'vinte e dois': '22',
    'vinte e duas': '22',
    'vinte e um': '21',
    'vinte e uma': '21',
    'vinte': '20',
    'dezenove': '19',
    'dezoito': '18',
    'dezessete': '17',
    'dezesseis': '16',
    'quinze': '15',
    'quatorze': '14',
    'catorze': '14',
    'treze': '13',
    'doze': '12',
    'onze': '11',
    'dez': '10',
    'nove': '9',
    'oito': '8',
    'sete': '7',
    'seis': '6',
    'cinco': '5',
    'quatro': '4',
    'três': '3',
    'tres': '3',
    'duas': '2',
    'dois': '2',
    'uma': '1',
    'um': '1',
  };

  for (const [w, num] of Object.entries(wordNumbers)) {
    text = text.replace(new RegExp(`(?<=\\b(?:às|as|pras|para\\s+as|daqui\\s+a|em|dia|avise|antes)\\s+)${w}\\b`, 'gi'), num);
    text = text.replace(new RegExp(`\\b${w}(?=\\s+(?:horas?|minutos?|min|h|dias?|segundos?)\\b)`, 'gi'), num);
    text = text.replace(new RegExp(`(?<=\\b(?:às|as|pras)\\s+\\d{1,2}\\s+e\\s+)${w}\\b`, 'gi'), num);
  }

  return text.trim();
}

export function parseReminderCommand(params: ParseReminderInput): ParseReminderResult {
  const cleanInput = cleanSpokenTranscript(params.texto);
  const normalized = normalizeSpokenPortugueseNumbers(cleanInput);
  const rawText = normalized.trim();
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
      // Stays explicitly TODAY
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

      let weekdayFound = false;
      for (const [dayName, dayIndex] of Object.entries(weekDays)) {
        const regex = new RegExp(`(?:^|[^\\w\\u00C0-\\u017F])(?:na\\s+|no\\s+|próxim[ao]\\s+)?${dayName}(?:[^\\w\\u00C0-\\u017F]|$)`, 'i');
        if (regex.test(text)) {
          const currentDay = ref.getDay();
          let daysDiff = dayIndex - currentDay;
          if (daysDiff <= 0) daysDiff += 7;
          target.setDate(target.getDate() + daysDiff);
          weekdayFound = true;
          break;
        }
      }

      // Check specific day of month: "dia 25", "dia 10"
      if (!weekdayFound) {
        const dayOfMonthMatch = text.match(/(?:^|[^\w\u00C0-\u017F])dia\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);
        if (dayOfMonthMatch) {
          const targetDay = parseInt(dayOfMonthMatch[1], 10);
          if (targetDay >= 1 && targetDay <= 31) {
            target.setDate(targetDay);
            if (target.getTime() < ref.getTime()) {
              target.setMonth(target.getMonth() + 1);
            }
          }
        }
      }
    }

    // 4. Specific Time
    // Matches: "às 14:30", "14h30", "às 14 e 30", "às 14 e meia", "15 horas", "às 15", "pras 14"
    const halfPastMatch = text.match(/(?:às|as|pras|para\s+as)?\s*(\d{1,2})\s*e\s*meia(?:[^\w\u00C0-\u017F]|$)/i);
    const hourAndMinuteMatch = text.match(/(?:às|as|pras|para\s*as|para\s*às)?\s*(\d{1,2})\s*e\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);
    const timeColonOrHMatch = text.match(/(?:às|as|pras|para\s*as|para\s*às)?\s*(\d{1,2})(?:h|:)(\d{2})?(?:[^\w\u00C0-\u017F]|$)/i);
    const hourOnlyMatch =
      text.match(/(\d{1,2})\s*horas?(?:[^\w\u00C0-\u017F]|$)/i) ||
      text.match(/(?:às|as|pras|para\s*as|para\s*às)\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);

    if (halfPastMatch) {
      let h = parseInt(halfPastMatch[1], 10);
      if (h >= 1 && h <= 6 && (text.includes('tarde') || ref.getHours() >= 10)) {
        h += 12;
      }
      target.setHours(h, 30, 0, 0);
    } else if (hourAndMinuteMatch) {
      let h = parseInt(hourAndMinuteMatch[1], 10);
      const m = parseInt(hourAndMinuteMatch[2], 10);
      if (h >= 1 && h <= 6 && (text.includes('tarde') || ref.getHours() >= 10)) {
        h += 12;
      }
      target.setHours(h, m, 0, 0);
      if (!isToday && !isTomorrow && !isAfterTomorrow && target.getTime() <= ref.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else if (timeColonOrHMatch) {
      let hours = parseInt(timeColonOrHMatch[1], 10);
      const minutes = timeColonOrHMatch[2] ? parseInt(timeColonOrHMatch[2], 10) : 0;
      if (hours >= 1 && hours <= 6 && (text.includes('tarde') || (!text.includes('manhã') && ref.getHours() >= 10))) {
        hours += 12;
      }
      target.setHours(hours, minutes, 0, 0);

      if (!isToday && !isTomorrow && !isAfterTomorrow && target.getTime() <= ref.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else if (hourOnlyMatch) {
      let hours = parseInt(hourOnlyMatch[1], 10);
      if (hours >= 1 && hours <= 6 && (text.includes('tarde') || (!text.includes('manhã') && ref.getHours() >= 10))) {
        hours += 12;
      }
      target.setHours(hours, 0, 0, 0);

      if (!isToday && !isTomorrow && !isAfterTomorrow && target.getTime() <= ref.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else {
      // Default time periods if no explicit hour given
      if (text.includes('de manhã') || text.includes('pela manhã') || text.includes('cedo')) {
        target.setHours(9, 0, 0, 0);
      } else if (text.includes('à tarde') || text.includes('a tarde') || text.includes('pela tarde')) {
        target.setHours(14, 0, 0, 0);
      } else if (text.includes('no fim da tarde') || text.includes('entardecer')) {
        target.setHours(18, 0, 0, 0);
      } else if (text.includes('à noite') || text.includes('a noite') || text.includes('pela noite')) {
        target.setHours(20, 0, 0, 0);
      } else if (isTomorrow || isAfterTomorrow) {
        target.setHours(9, 0, 0, 0);
      } else if (isToday) {
        const nextHour = ref.getHours() + 1;
        target.setHours(Math.min(nextHour, 23), 0, 0, 0);
      } else {
        target = new Date(target.getTime() + 60 * 60000);
      }
    }
  }

  // 5. Clean task title by removing command triggers and temporal words ANYWHERE in text
  let cleanedTitle = rawText;

  // Remove command prefixes/phrases
  cleanedTitle = cleanedTitle
    .replace(/(?:^|\b)(?:por\s+favor\s*,?\s*)?(?:me\s+)?(?:lembre|lembrar|avise|avisar|agendar|anotar|não\s+esquecer|nao\s+esquecer|criar\s+lembrete|marcar)(?:\s+(?:de|para|que|o|a))?\b/gi, ' ')
    .replace(/(?:^|\b)(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje)\b/gi, ' ')
    .replace(/(?:^|\b)(?:às|as|pras|para\s*as|para\s*às)?\s*\d{1,2}(?:h|:\d{2})\b/gi, ' ')
    .replace(/(?:^|\b)\d{1,2}\s*horas?\b/gi, ' ')
    .replace(/(?:^|\b)(?:às|as|pras)\s*\d{1,2}\s*e\s*meia\b/gi, ' ')
    .replace(/(?:^|\b)(?:daqui\s*a|em)\s*\d+\s*(?:minutos?|min|horas?|h)\b/gi, ' ')
    .replace(/(?:^|\b)(?:daqui\s*a|em)\s*meia\s*hora\b/gi, ' ')
    .replace(/(?:^|\b)(?:com|avise|avisar)?\s*\d+\s*(?:minutos?|min)\s*(?:de\s*anteced[êe]ncia|antes)\b/gi, ' ')
    .replace(/(?:^|\b)(?:de\s+manh[ãa]|pela\s+manh[ãa]|cedo|à\s+tarde|a\s+tarde|pela\s+tarde|à\s+noite|a\s+noite|pela\s+noite)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip connector words at the beginning or end
  cleanedTitle = cleanedTitle
    .replace(/^(?:de\s+|para\s+|que\s+|em\s+|o\s+|a\s+|com\s+|sobre\s+)/i, '')
    .replace(/(?:\s+de|\s+para|\s+às|\s+as)$/i, '')
    .trim();

  if (!cleanedTitle || cleanedTitle.length < 2) {
    cleanedTitle = rawText || 'Compromisso agendado';
  }
  cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);

  // 6. Category classification
  let categoria = 'Geral';
  const lTitle = cleanedTitle.toLowerCase();

  const trabalhoWords = [
    'reunião', 'reuniao', 'cliente', 'projeto', 'relatório', 'relatorio',
    'proposta', 'chefe', 'apresentação', 'apresentacao', 'email', 'entrega',
    'sprint', 'call', 'alinhar', 'contrato', 'empresa', 'vaga', 'entrevista',
    'cadastro', 'ticket', 'trabalho', 'audiência', 'audiencia'
  ];
  const saudeWords = [
    'remédio', 'remedio', 'medicamento', 'água', 'agua', 'médico', 'medico',
    'consulta', 'dentista', 'academia', 'treino', 'pilates', 'exame', 'vacina',
    'caminhar', 'psicólogo', 'psicologo', 'terapia', 'alongar', 'dormir',
    'hospital', 'saúde', 'saude', 'pressão', 'pressao', 'insulina'
  ];
  const financasWords = [
    'pagar', 'pagamento', 'boleto', 'conta', 'fatura', 'banco', 'pix',
    'transferência', 'transferencia', 'imposto', 'aluguel', 'luz', 'cartão',
    'cartao', 'dinheiro', 'salário', 'salario', 'comprar', 'depósito', 'deposito'
  ];
  const estudosWords = [
    'estudar', 'estudo', 'prova', 'aula', 'lição', 'licao', 'curso',
    'faculdade', 'tese', 'dever', 'ler', 'livro', 'simulado', 'resumo',
    'enem', 'escola', 'seminário', 'seminario'
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
  const dayDesc = isToday
    ? 'hoje'
    : isTomorrow
    ? 'amanhã'
    : isAfterTomorrow
    ? 'depois de amanhã'
    : `${pad(target.getDate())}/${pad(target.getMonth() + 1)}`;

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
