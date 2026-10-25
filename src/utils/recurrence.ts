export type RecorrenciaTipo = 'nenhuma' | 'diaria' | 'semanal';

export interface NextOccurrenceResult {
  nextDateIso: string;
  nextTimestamp: number;
}

export interface DiaSemanaOption {
  id: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  curto: string;
  longo: string;
}

export const DIAS_SEMANA_OPCOES: DiaSemanaOption[] = [
  { id: 0, curto: 'Dom', longo: 'Domingo' },
  { id: 1, curto: 'Seg', longo: 'Segunda-feira' },
  { id: 2, curto: 'Ter', longo: 'Terça-feira' },
  { id: 3, curto: 'Qua', longo: 'Quarta-feira' },
  { id: 4, curto: 'Qui', longo: 'Quinta-feira' },
  { id: 5, curto: 'Sex', longo: 'Sexta-feira' },
  { id: 6, curto: 'Sáb', longo: 'Sábado' },
];

/**
 * Calculates the next occurrence timestamp and ISO string for a recurring reminder.
 * Preserves the exact scheduled time-of-day (hours, minutes, seconds).
 */
export function calculateNextRecurrence(
  dataHoraExecucao: string,
  recorrencia?: RecorrenciaTipo,
  diasSemana?: number[],
  fromTimestamp?: number
): NextOccurrenceResult | null {
  if (!recorrencia || recorrencia === 'nenhuma') {
    return null;
  }

  const baseMs = fromTimestamp !== undefined ? fromTimestamp : Date.now();

  // Extract scheduled hour, minute, second
  let scheduledHour = 9;
  let scheduledMinute = 0;
  let scheduledSecond = 0;

  const rawIso = (dataHoraExecucao || '').trim().replace(' ', 'T');
  if (rawIso.includes('T')) {
    const timePart = rawIso.split('T')[1] || '';
    const tParts = timePart.split(':').map((v) => parseInt(v, 10));
    if (!isNaN(tParts[0])) scheduledHour = tParts[0];
    if (!isNaN(tParts[1])) scheduledMinute = tParts[1];
    if (!isNaN(tParts[2])) scheduledSecond = tParts[2];
  } else {
    const d = new Date(dataHoraExecucao);
    if (!isNaN(d.getTime())) {
      scheduledHour = d.getHours();
      scheduledMinute = d.getMinutes();
      scheduledSecond = d.getSeconds();
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  if (recorrencia === 'diaria') {
    // Start from today with the scheduled time
    const candidate = new Date(baseMs);
    candidate.setHours(scheduledHour, scheduledMinute, scheduledSecond, 0);

    // If candidate is already in the past or right now, move forward by at least 1 day
    if (candidate.getTime() <= baseMs) {
      candidate.setDate(candidate.getDate() + 1);
    }

    // Keep adding 1 day if somehow still not strictly in the future
    while (candidate.getTime() <= baseMs) {
      candidate.setDate(candidate.getDate() + 1);
    }

    const nextDateIso = `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}T${pad(scheduledHour)}:${pad(scheduledMinute)}:${pad(scheduledSecond)}`;
    return {
      nextDateIso,
      nextTimestamp: candidate.getTime(),
    };
  }

  if (recorrencia === 'semanal') {
    let effectiveDays: number[] = Array.isArray(diasSemana) && diasSemana.length > 0 ? diasSemana : [];

    // Fallback: If no specific days provided, use the original date's day of week
    if (effectiveDays.length === 0) {
      const origDate = new Date(dataHoraExecucao);
      effectiveDays = [!isNaN(origDate.getTime()) ? origDate.getDay() : new Date(baseMs).getDay()];
    }

    // Sort days
    effectiveDays = Array.from(new Set(effectiveDays)).sort((a, b) => a - b);

    // Search forward from today
    const candidate = new Date(baseMs);
    candidate.setHours(scheduledHour, scheduledMinute, scheduledSecond, 0);

    // If today matches one of the days AND is strictly in the future (> baseMs + 5 seconds buffer), we can use today
    const todayMatches = effectiveDays.includes(candidate.getDay());
    if (todayMatches && candidate.getTime() > baseMs + 5000) {
      const nextDateIso = `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}T${pad(scheduledHour)}:${pad(scheduledMinute)}:${pad(scheduledSecond)}`;
      return {
        nextDateIso,
        nextTimestamp: candidate.getTime(),
      };
    }

    // Otherwise advance day by day (up to 14 days) until we find a matching weekday in effectiveDays
    for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
      const nextCandidate = new Date(baseMs);
      nextCandidate.setDate(nextCandidate.getDate() + dayOffset);
      nextCandidate.setHours(scheduledHour, scheduledMinute, scheduledSecond, 0);

      if (effectiveDays.includes(nextCandidate.getDay()) && nextCandidate.getTime() > baseMs) {
        const nextDateIso = `${nextCandidate.getFullYear()}-${pad(nextCandidate.getMonth() + 1)}-${pad(nextCandidate.getDate())}T${pad(scheduledHour)}:${pad(scheduledMinute)}:${pad(scheduledSecond)}`;
        return {
          nextDateIso,
          nextTimestamp: nextCandidate.getTime(),
        };
      }
    }
  }

  return null;
}

/**
 * Returns a clean, user-friendly label for the recurrence in Portuguese.
 */
export function formatRecurrenceLabel(recorrencia?: RecorrenciaTipo, diasSemana?: number[]): string {
  if (!recorrencia || recorrencia === 'nenhuma') {
    return 'Lembrete Único';
  }

  if (recorrencia === 'diaria') {
    return 'Diário (todos os dias)';
  }

  if (recorrencia === 'semanal') {
    if (!diasSemana || diasSemana.length === 0) {
      return 'Semanal';
    }

    if (diasSemana.length === 7) {
      return 'Diário (todos os dias)';
    }

    // Check if weekdays (Mon-Fri)
    const isWeekdays =
      diasSemana.length === 5 &&
      [1, 2, 3, 4, 5].every((d) => diasSemana.includes(d));
    if (isWeekdays) {
      return 'Dias úteis (Seg a Sex)';
    }

    // Check if weekend (Sat, Sun)
    const isWeekend =
      diasSemana.length === 2 &&
      diasSemana.includes(0) &&
      diasSemana.includes(6);
    if (isWeekend) {
      return 'Fim de semana (Sáb e Dom)';
    }

    const shortLabels = diasSemana
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DIAS_SEMANA_OPCOES.find((opt) => opt.id === d)?.curto || String(d));

    return `Semanal (${shortLabels.join(', ')})`;
  }

  return 'Personalizado';
}
