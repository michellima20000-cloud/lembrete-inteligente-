import type { Lembrete, StatusTarefa } from '../types/index.ts';

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
 * while preserving natural Portuguese speech phrasing.
 */
export function cleanSpokenTranscript(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // 1. Remove consecutive identical words (case-insensitive, unicode-safe)
  // e.g. "lembrar lembrar de de pagar" -> "lembrar de pagar"
  text = text.replace(/\b([a-zA-Z\u00C0-\u017F0-9_]{2,})(?:\s+\1)+(?=[^\w\u00C0-\u017F]|$)/gi, '$1');

  // 2. Remove repeated consecutive phrases (e.g. "pagar conta pagar conta")
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
 * Accents and beautifies Portuguese speech transcript with correct diacritics,
 * clean typography, capitalization, and numbers.
 */
export function formatTranscriptPretty(raw: string): string {
  if (!raw) return '';
  let text = cleanSpokenTranscript(raw);

  // Common spoken Portuguese words that might lack diacritics from speech recognition
  const accentMap: Record<string, string> = {
    remedio: 'remédio',
    remedios: 'remédios',
    medico: 'médico',
    medica: 'médica',
    farmacia: 'farmácia',
    amanha: 'amanhã',
    reuniao: 'reunião',
    reunioes: 'reuniões',
    relatorio: 'relatório',
    relatorios: 'relatórios',
    apresentacao: 'apresentação',
    almoco: 'almoço',
    cafe: 'café',
    pao: 'pão',
    agua: 'água',
    exercicio: 'exercício',
    exercicios: 'exercícios',
    licao: 'lição',
    cartao: 'cartão',
    sabado: 'sábado',
    terca: 'terça',
    horario: 'horário',
    noticia: 'notícia',
    clinica: 'clínica',
    psicologo: 'psicólogo',
    dentista: 'dentista',
    urgente: 'urgente',
    rapido: 'rápido',
    ja: 'já',
    voce: 'você',
    nao: 'não',
    tambem: 'também',
    ate: 'até',
    pos: 'pós',
    saude: 'saúde',
    pressao: 'pressão',
    avaliacao: 'avaliação',
    audiencia: 'audiência',
    conferencia: 'conferência',
    laboratorio: 'laboratório',
    numero: 'número',
    proximo: 'próximo',
    proxima: 'próxima',
    politica: 'política',
    musica: 'música',
    ingles: 'inglês',
    portugues: 'português',
    historia: 'história',
    matematica: 'matemática',
    fisica: 'física',
    quimica: 'química',
    aniversario: 'aniversário',
    fatura: 'fatura',
    boleto: 'boleto',
    pagamento: 'pagamento',
    consulta: 'consulta',
    academia: 'academia',
    treino: 'treino',
  };

  for (const [plain, accented] of Object.entries(accentMap)) {
    const regex = new RegExp(`\\b${plain}\\b`, 'gi');
    text = text.replace(regex, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return accented.charAt(0).toUpperCase() + accented.slice(1);
      }
      return accented;
    });
  }

  // Prettify common temporal words and week days
  text = text.replace(/\bsegunda\s+feira\b/gi, 'segunda-feira');
  text = text.replace(/\bterca\s+feira\b/gi, 'terça-feira');
  text = text.replace(/\bterça\s+feira\b/gi, 'terça-feira');
  text = text.replace(/\bquarta\s+feira\b/gi, 'quarta-feira');
  text = text.replace(/\bquinta\s+feira\b/gi, 'quinta-feira');
  text = text.replace(/\bsexta\s+feira\b/gi, 'sexta-feira');

  text = text.replace(/\bas\s+(\d{1,2})\s*horas?\b/gi, 'às $1h');
  text = text.replace(/\bas\s+(\d{1,2})\s*e\s*meia\b/gi, 'às $1:30');
  text = text.replace(/\bas\s+(\d{1,2})\s*e\s*(\d{1,2})\b/gi, 'às $1:$2');
  text = text.replace(/\bas\s+(\d{1,2}):(\d{2})\b/gi, 'às $1:$2');
  text = text.replace(/\bas\s+(\d{1,2})h\b/gi, 'às $1h');
  text = text.replace(/\bas\s+(\d{1,2})\b(?!\s*(?:minutos?|min|dias?|meses|anos))/gi, 'às $1h');
  text = text.replace(/\bdaqui\s+a\s+(\d+)\s*min(?:utos?)?\b/gi, 'daqui a $1 minutos');
  text = text.replace(/\bdaqui\s+meia\s+hora\b/gi, 'daqui a 30 minutos');
  text = text.replace(/\bdaqui\s+uma\s+hora\b/gi, 'daqui a 60 minutos');

  // Capitalize first character
  text = text.trim();
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
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
    'vinte': '20',
    'quinze': '15',
    'dez': '10',
    'cinco': '5',
    'zero': '0',
    'uma': '1',
    'duas': '2',
    'dois': '2',
    'três': '3',
    'tres': '3',
    'quatro': '4',
    'seis': '6',
    'sete': '7',
    'oito': '8',
    'nove': '9',
    'onze': '11',
    'doze': '12',
    'treze': '13',
    'quatorze': '14',
    'catorze': '14',
    'dezesseis': '16',
    'dezessete': '17',
    'dezoito': '18',
    'dezenove': '19',
  };

  // Convert numbers in "às X" context
  for (const [w, num] of Object.entries(wordNumbers)) {
    text = text.replace(new RegExp(`(?<=\\b(?:às|as|pras|para\\s+as|para\\s+às)\\s+)${w}\\b`, 'gi'), num);
    text = text.replace(new RegExp(`\\b${w}\\s*(?=horas?\\b)`, 'gi'), num);
    text = text.replace(new RegExp(`(?<=\\b(?:em|daqui\\s+a)\\s+)${w}\\s*(?=minutos?|min\\b)`, 'gi'), num);
    text = text.replace(new RegExp(`(?<=\\b(?:às|as|pras)\\s+\\d{1,2}\\s+e\\s+)${w}\\b`, 'gi'), num);
  }

  return text.trim();
}

/**
 * Checks if a string only contains temporal indicator words without any actual task action
 */
export function isOnlyTemporalQuery(raw: string): boolean {
  if (!raw) return true;
  const stripped = raw
    .toLowerCase()
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:por\s+favor\s*,?\s*)?(?:me\s+)?(?:lembre|lembrar|avise|avisar|agendar|anotar|não\s+esquecer|nao\s+esquecer|criar\s+lembrete|marcar)(?:\s+(?:de|para|que|o|a))?(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:depois\s+de\s+amanh[ãa]|amanh[ãa]|hoje)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:às|as|pras|para\s*as|para\s*às)?\s*\d{1,2}(?:h|:\d{2})?(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])\d{1,2}\s*horas?(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:às|as|pras)\s*\d{1,2}\s*e\s*meia(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:daqui\s*a|em)\s*\d+\s*(?:minutos?|min|horas?|h)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:daqui\s*a|em)\s*meia\s*hora(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:com|avise|avisar)?\s*\d+\s*(?:minutos?|min)\s*(?:de\s*anteced[êe]ncia|antes)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:de\s+manh[ãa]|pela\s+manh[ãa]|cedo|à\s+tarde|a\s+tarde|pela\s+tarde|à\s+noite|a\s+noite|pela\s+noite)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/\s+/g, '')
    .trim();

  return stripped.length === 0;
}

export function parseReminderCommand(params: ParseReminderInput): ParseReminderResult {
  const cleanInput = formatTranscriptPretty(params.texto);
  const normalized = normalizeSpokenPortugueseNumbers(cleanInput);
  const rawText = normalized.trim();
  const text = rawText.toLowerCase();

  // Validate if user only provided "hoje" or temporal words without a task
  if (isOnlyTemporalQuery(rawText)) {
    return {
      status: 'erro',
      user_id: params.user_id,
      lembrete: {
        titulo: '',
        data_hora_execucao: '',
        status_tarefa: 'pendente',
      },
      mensagem_sistema:
        'Por favor, informe também a tarefa do lembrete (ex: "hoje às 15h tomar remédio" ou "comprar pão hoje às 18h").',
    };
  }

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
    const halfPastMatch = text.match(/(?:às|as|pras|para\s+as)?\s*(\d{1,2})\s*e\s*meia(?:[^\w\u00C0-\u017F]|$)/i);
    const hourAndMinuteMatch = text.match(/(?:às|as|pras|para\s*as|para\s*às)\s*(\d{1,2})\s*e\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);
    const timeColonOrHMatch = text.match(/(?:às|as|pras|para\s*as|para\s*às)?\s*(\d{1,2})(?:h|:)(\d{2})?(?:[^\w\u00C0-\u017F]|$)/i);
    const hourOnlyMatch =
      text.match(/(\d{1,2})\s*horas?(?:[^\w\u00C0-\u017F]|$)/i) ||
      text.match(/(?:às|as|pras|para\s*as|para\s*às)\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);

    if (halfPastMatch) {
      let h = parseInt(halfPastMatch[1], 10);
      if (h >= 1 && h <= 11 && (text.includes('tarde') || text.includes('noite') || (isToday && h < ref.getHours()))) {
        h += 12;
      }
      target.setHours(h, 30, 0, 0);
    } else if (hourAndMinuteMatch) {
      let h = parseInt(hourAndMinuteMatch[1], 10);
      const m = parseInt(hourAndMinuteMatch[2], 10);
      if (h >= 1 && h <= 11 && (text.includes('tarde') || text.includes('noite') || (isToday && h < ref.getHours()))) {
        h += 12;
      }
      target.setHours(h, m, 0, 0);
    } else if (timeColonOrHMatch) {
      let hours = parseInt(timeColonOrHMatch[1], 10);
      const minutes = timeColonOrHMatch[2] ? parseInt(timeColonOrHMatch[2], 10) : 0;
      if (hours >= 1 && hours <= 11 && (text.includes('tarde') || text.includes('noite') || (isToday && hours < ref.getHours() && !text.includes('manhã')))) {
        hours += 12;
      }
      target.setHours(hours, minutes, 0, 0);
    } else if (hourOnlyMatch) {
      let hours = parseInt(hourOnlyMatch[1], 10);
      if (hours >= 1 && hours <= 11 && (text.includes('tarde') || text.includes('noite') || (isToday && hours < ref.getHours() && !text.includes('manhã')))) {
        hours += 12;
      }
      target.setHours(hours, 0, 0, 0);
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
        // Today with no explicit hour: default to 1 hour from now
        target = new Date(ref.getTime() + 60 * 60 * 1000);
      } else {
        target = new Date(ref.getTime() + 60 * 60 * 1000);
      }
    }

    // Safety check: if target time is in the past for today or unspecified day, advance or adjust
    if (target.getTime() <= ref.getTime()) {
      if (isToday) {
        // If hour has already passed today, try evening hour (e.g. 10 -> 22) or set 30 min from now
        if (target.getHours() < 12 && target.getHours() + 12 > ref.getHours()) {
          target.setHours(target.getHours() + 12);
        } else {
          // If already past, schedule for 30 minutes from now today
          target = new Date(ref.getTime() + 30 * 60 * 1000);
        }
      } else if (!isTomorrow && !isAfterTomorrow) {
        // If no day was specified and time passed today, advance to tomorrow
        target.setDate(target.getDate() + 1);
      }
    }
  }

  // 5. Clean task title by removing command triggers and temporal words ANYWHERE in text
  let cleanedTitle = rawText;
  const wordBound = (pattern: string) => new RegExp('(?:^|[^\\w\\u00C0-\\u017F])(?:' + pattern + ')(?=[^\\w\\u00C0-\\u017F]|$)', 'gi');

  cleanedTitle = cleanedTitle.replace(wordBound('(?:por\\s+favor\\s*,?\\s*)?(?:me\\s+)?(?:lembre|lembrar|avise|avisar|agendar|anotar|não\\s+esquecer|nao\\s+esquecer|criar\\s+lembrete|marcar)(?:\\s+(?:de|para|que|o|a))?'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:daqui\\s*a|em)\\s*\\d+\\s*(?:minutos?|min|horas?|h)'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:daqui\\s*a|em)\\s*meia\\s*hora'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:com|avise|avisar)?\\s*\\d+\\s*(?:minutos?|min)\\s*(?:de\\s*anteced[êe]ncia|antes)'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:às|as|pras|para\\s*as|para\\s*às)\\s*\\d{1,2}(?:\\s*(?:e\\s*(?:\\d{1,2}|meia)|:\\d{2}|h|horas?))?'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('\\d{1,2}\\s*(?:h|horas?|:\\d{2})'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:depois\\s+de\\s+amanh[ãa]|amanh[ãa]|hoje)'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:na\\s+|no\\s+|próxim[ao]\\s+)?(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:[ -]feira)?'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:de\\s+manh[ãa]|pela\\s+manh[ãa]|cedo|à\\s+tarde|a\\s+tarde|pela\\s+tarde|à\\s+noite|a\\s+noite|pela\\s+noite)'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:dia\\s+)\\d{1,2}'), ' ');
  cleanedTitle = cleanedTitle.replace(/\s+/g, ' ').trim();

  // Strip connector words at the beginning or end
  cleanedTitle = cleanedTitle
    .replace(/^(?:de\s+|para\s+|que\s+|em\s+|o\s+|a\s+|com\s+|sobre\s+|às\s+|as\s+|na\s+|no\\s+)/i, '')
    .replace(/(?:\s+de|\s+para|\s+às|\s+as|\s+na|\s+no)$/i, '')
    .trim();

  if (!cleanedTitle || cleanedTitle.length < 2) {
    cleanedTitle = rawText || 'Compromisso';
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
