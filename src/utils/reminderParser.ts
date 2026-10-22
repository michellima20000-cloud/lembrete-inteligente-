import type { StatusTarefa } from '../types/index.ts';

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
    manha: 'manhã',
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

  // Prettify common temporal words cleanly
  text = text.replace(/\bas\s+(\d{1,2})\s*horas?\b/gi, 'às $1h');
  text = text.replace(/\bas\s+(\d{1,2})\s*e\s*meia\b/gi, 'às $1:30');
  text = text.replace(/\bas\s+(\d{1,2})\s*e\s*(\d{1,2})\b/gi, 'às $1:$2');
  text = text.replace(/\bas\s+(\d{1,2}):(\d{2})\b/gi, 'às $1:$2');
  text = text.replace(/\bas\s+(\d{1,2})h\b/gi, 'às $1h');
  text = text.replace(/\bas\s+(\d{1,2})\b(?!\s*(?:minutos?|min|dias?|meses|anos))/gi, 'às $1h');
  text = text.replace(/\bdaqui\s+a\s+(\d+)\s*min(?:utos?)?\b/gi, 'daqui a $1 minutos');

  // Capitalize first character
  text = text.trim();
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

/**
 * Normalizes spoken Portuguese numbers, colloquial times, and relative phrases
 * into crisp, standardized time formats without destroying day period context.
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

  // Convert spoken compound hour and minutes: "oito e quinze" -> "8:15", "duas e meia" -> "2:30"
  const hourWords: Record<string, string> = {
    'uma': '1', 'um': '1', 'duas': '2', 'dois': '2', 'três': '3', 'tres': '3',
    'quatro': '4', 'cinco': '5', 'seis': '6', 'sete': '7', 'oito': '8',
    'nove': '9', 'dez': '10', 'onze': '11', 'doze': '12',
  };

  const minWords: Record<string, string> = {
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
    'meia': '30',
  };

  // 1. Convert compound hour + minute: 'oito e quinze' -> '8:15'
  for (const [hW, hNum] of Object.entries(hourWords)) {
    for (const [mW, mNum] of Object.entries(minWords)) {
      const p = new RegExp(`\\b${hW}\\s*(?:horas?)?\\s*e\\s*${mW}\\b`, 'gi');
      text = text.replace(p, ` ${hNum}:${String(mNum).padStart(2, '0')} `);
    }
  }

  // 2. Convert standalone hour word before day period: 'oito da manhã' -> '8 da manhã'
  for (const [hW, hNum] of Object.entries(hourWords)) {
    const p = new RegExp(`\\b${hW}\\s*(?=(?:da|de|pela)\\s+(?:manh[ãa]|tarde|noite|madrugada))`, 'gi');
    text = text.replace(p, ` ${hNum} `);
  }

  // 3. Convert numbers in generic time context: "às X", "X horas", "X minutos"
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

  for (const [w, num] of Object.entries(wordNumbers)) {
    text = text.replace(new RegExp(`(?<=\\b(?:às|as|pras|para\\s+as|para\\s+às)\\s+)${w}\\b`, 'gi'), num);
    text = text.replace(new RegExp(`\\b${w}\\s*(?=horas?\\b)`, 'gi'), num);
    text = text.replace(new RegExp(`(?<=\\b(?:em|daqui\\s+a)\\s+)${w}\\s*(?=minutos?|min\\b)`, 'gi'), num);
    text = text.replace(new RegExp(`(?<=\\b(?:às|as|pras)\\s+\\d{1,2}\\s+e\\s+)${w}\\b`, 'gi'), num);
  }

  // Handle "X e meia" -> "X:30"
  text = text.replace(/\b(\d{1,2})\s*e\s*meia\b/gi, '$1:30');

  // Handle "X e Y" -> "X:Y" (e.g. "8 e 15" -> "8:15")
  text = text.replace(/\b(\d{1,2})\s*(?:horas?)?\s*e\s*(\d{1,2})\b/gi, (_match, h, m) => {
    const padM = String(m).padStart(2, '0');
    return `${h}:${padM}`;
  });

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
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:(?:da|de|pela)\s+manh[ãa]|cedo|matutin[ao])(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:(?:da|de|pela|[àa])\s+tarde|vespertin[ao])(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:(?:da|de|pela|[àa])\s+noite|noturn[ao])(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:(?:da|de|pela)\s+madrugada)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
    .replace(/(?:^|[^\w\u00C0-\u017F])(?:meio[- ]dia|meia[- ]noite)(?=[^\w\u00C0-\u017F]|$)/gi, ' ')
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
        'Por favor, informe também a tarefa do lembrete (ex: "8:15 da manhã tomar remédio" ou "comprar pão às 18h").',
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

  // Explicit period markers (Brazilian Portuguese)
  const isMorning = /(?:^|[^\w\u00C0-\u017F])(?:da\s+manh[ãa]|de\s+manh[ãa]|pela\s+manh[ãa]|cedo|matutin[ao])(?:[^\w\u00C0-\u017F]|$)/i.test(text);
  const isAfternoon = /(?:^|[^\w\u00C0-\u017F])(?:da\s+tarde|de\s+tarde|pela\s+tarde|[àa]\s+tarde|vespertin[ao])(?:[^\w\u00C0-\u017F]|$)/i.test(text);
  const isNight = /(?:^|[^\w\u00C0-\u017F])(?:da\s+noite|de\s+noite|pela\s+noite|[àa]\s+noite|noturn[ao])(?:[^\w\u00C0-\u017F]|$)/i.test(text);
  const isDawn = /(?:^|[^\w\u00C0-\u017F])(?:da\s+madrugada|de\s+madrugada|pela\s+madrugada)(?:[^\w\u00C0-\u017F]|$)/i.test(text);

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
      // Stays initially today
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

    // 4. Specific Hour and Minute Extraction
    // Match colon format: "8:15", "08:15", "15:30"
    const timeColonMatch = text.match(/(?:às|as|pras|para\s*(?:as|às))?\s*(\d{1,2}):(\d{2})(?:[^\w\u00C0-\u017F]|$)/i);
    // Match H format: "8h15", "8h", "15h"
    const timeHMatch = text.match(/(?:às|as|pras|para\s*(?:as|às))?\s*(\d{1,2})h(\d{2})?(?:[^\w\u00C0-\u017F]|$)/i);
    // Match "X e meia": "8 e meia"
    const halfPastMatch = text.match(/(?:às|as|pras|para\s*(?:as|às))?\s*(\d{1,2})\s*e\s*meia(?:[^\w\u00C0-\u017F]|$)/i);
    // Match "X e Y": "8 e 15", "8 horas e 15"
    const hourAndMinuteMatch = text.match(/(?:às|as|pras|para\s*(?:as|às))?\s*(\d{1,2})\s*(?:horas?)?\s*e\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);
    // Match Hour Only: "8 horas", "às 8", "às 8h"
    const hourOnlyMatch =
      text.match(/(\d{1,2})\s*horas?(?:[^\w\u00C0-\u017F]|$)/i) ||
      text.match(/(?:às|as|pras|para\s*(?:as|às))\s*(\d{1,2})(?:[^\w\u00C0-\u017F]|$)/i);

    let parsedHour: number | null = null;
    let parsedMinute = 0;

    if (timeColonMatch) {
      parsedHour = parseInt(timeColonMatch[1], 10);
      parsedMinute = parseInt(timeColonMatch[2], 10);
    } else if (timeHMatch) {
      parsedHour = parseInt(timeHMatch[1], 10);
      parsedMinute = timeHMatch[2] ? parseInt(timeHMatch[2], 10) : 0;
    } else if (hourAndMinuteMatch) {
      parsedHour = parseInt(hourAndMinuteMatch[1], 10);
      parsedMinute = parseInt(hourAndMinuteMatch[2], 10);
    } else if (halfPastMatch) {
      parsedHour = parseInt(halfPastMatch[1], 10);
      parsedMinute = 30;
    } else if (hourOnlyMatch) {
      parsedHour = parseInt(hourOnlyMatch[1] || hourOnlyMatch[2], 10);
      parsedMinute = 0;
    }

    // Apply Explicit Period or Default Rule with 100% Precision
    if (parsedHour !== null) {
      let finalHour = parsedHour;
      const finalMinute = Math.min(59, Math.max(0, parsedMinute));

      if (isMorning || isDawn) {
        // EXPLICITLY MORNING / DAWN: Hours 1 to 11 remain morning hours!
        // E.g. "8:15 da manhã" -> 08:15. NEVER ADD 12! NEVER CONVERT TO NIGHT!
        if (finalHour >= 12 && finalHour <= 23 && isMorning) {
          finalHour = finalHour - 12; // E.g. typo "20h da manhã" -> 08:00
        }
      } else if (isAfternoon) {
        // EXPLICITLY AFTERNOON: Hours 1 to 11 convert to afternoon (13 to 23)
        // E.g. "3 da tarde" -> 15:00, "1:30 da tarde" -> 13:30, "14h da tarde" -> 14:00
        if (finalHour >= 1 && finalHour <= 11) {
          finalHour += 12;
        }
      } else if (isNight) {
        // EXPLICITLY NIGHT: Hours 1 to 11 convert to night (13 to 23)
        // E.g. "8 da noite" -> 20:00, "8:15 da noite" -> 20:15
        if (finalHour >= 1 && finalHour <= 11) {
          finalHour += 12;
        } else if (finalHour === 12) {
          finalHour = 0; // 12 da noite = 00:00 (meia-noite)
        }
      } else {
        // NO PERIOD SPECIFIED:
        // In colloquial Brazilian Portuguese, hours 1 to 6 without marker usually mean afternoon (13..18)
        if (finalHour >= 1 && finalHour <= 6) {
          finalHour += 12;
        }
        // Hours 7 to 11 are morning hours (07:00..11:00)
        // Hours 12 to 23 are already 24-hour afternoon/evening
      }

      target.setHours(finalHour, finalMinute, 0, 0);

      // PRESERVE THE REQUESTED TIME: If the requested time has already passed today,
      // schedule for TOMORROW at the EXACT SAME requested time!
      // Do NOT arbitrarily advance the hour by +12 or invent an unrelated time!
      if (target.getTime() <= ref.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else {
      // Default time periods if no explicit hour was specified at all
      if (isMorning) {
        target.setHours(8, 0, 0, 0);
      } else if (isAfternoon) {
        target.setHours(14, 0, 0, 0);
      } else if (isNight) {
        target.setHours(20, 0, 0, 0);
      } else if (isTomorrow || isAfterTomorrow) {
        target.setHours(9, 0, 0, 0);
      } else {
        // Default to 1 hour from now
        target = new Date(ref.getTime() + 60 * 60 * 1000);
      }

      if (target.getTime() <= ref.getTime()) {
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
  cleanedTitle = cleanedTitle.replace(wordBound('(?:com|avise|avisar)?\\s*\\d+\\s*(?:minutos?|min)\\s*(?:de\s*anteced[êe]ncia|antes)'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:às|as|pras|para\\s*as|para\\s*às)\\s*\\d{1,2}(?:\\s*(?:e\\s*(?:\\d{1,2}|meia)|:\\d{2}|h|horas?))?'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('\\d{1,2}:\\d{2}'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('\\d{1,2}\\s*(?:h|horas?)(?:\\s*\\d{2})?'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:depois\\s+de\\s+amanh[ãa]|amanh[ãa]|hoje)'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:na\\s+|no\\s+|próxim[ao]\\s+)?(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:[ -]feira)?'), ' ');
  // Thoroughly strip all day period expressions from title
  cleanedTitle = cleanedTitle.replace(wordBound('(?:da|de|pela)\\s+manh[ãa]|cedo|matutin[ao]'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:da|de|pela|[àa])\\s+tarde|vespertin[ao]'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:da|de|pela|[àa])\\s+noite|noturn[ao]'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:da|de|pela)\\s+madrugada'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('meio[- ]dia|meia[- ]noite'), ' ');
  cleanedTitle = cleanedTitle.replace(wordBound('(?:dia\\s+)\\d{1,2}'), ' ');
  cleanedTitle = cleanedTitle.replace(/\s+/g, ' ').trim();

  // Strip connector words at the beginning or end
  cleanedTitle = cleanedTitle
    .replace(/^(?:de\s+|para\s+|que\s+|em\s+|o\s+|a\s+|com\s+|sobre\s+|às\s+|as\s+|na\s+|no\s+)/i, '')
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

  const isScheduledForToday =
    target.getFullYear() === ref.getFullYear() &&
    target.getMonth() === ref.getMonth() &&
    target.getDate() === ref.getDate();

  const isScheduledForTomorrow =
    target.getFullYear() === ref.getFullYear() &&
    target.getMonth() === ref.getMonth() &&
    target.getDate() === ref.getDate() + 1;

  const dayDesc = isScheduledForToday
    ? 'hoje'
    : isScheduledForTomorrow
    ? 'amanhã'
    : `${pad(target.getDate())}/${pad(target.getMonth() + 1)}`;

  const periodLabel = target.getHours() < 12 ? 'da manhã' : target.getHours() < 18 ? 'da tarde' : 'da noite';

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
    mensagem_sistema: `Lembrete "${cleanedTitle}" agendado para ${dayDesc} às ${formattedHour} (${periodLabel})!`,
  };
}
