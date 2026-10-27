// Native Mobile Calendar & Alarm Integration Utility
// Integrates reminders with native Android (Google Agenda / Samsung Calendar) and iOS (Apple Calendar)
// Generates RFC 5545 compliant .ics calendar files with native VALARM audio alarm triggers.

import { Lembrete } from '../types';

function formatToUtcString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeIcsText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Builds RFC 5545 iCalendar content with native VALARM audio alarms.
 * When imported into Android or iOS, the phone's native alarm subsystem rings on time.
 */
export function buildIcsCalendar(reminders: Lembrete[], calendarName = 'Lembretes Inteligentes'): string {
  const nowUtc = formatToUtcString(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lembrete Inteligente//Alarme e Calendário Nativo//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ];

  for (const r of reminders) {
    if (!r.titulo || !r.data_hora_execucao) continue;

    const startDate = new Date(r.data_hora_execucao);
    if (isNaN(startDate.getTime())) continue;

    const endDate = new Date(startDate.getTime() + 15 * 60 * 1000);

    const startIcs = formatToUtcString(startDate);
    const endIcs = formatToUtcString(endDate);
    const uid = `lembrete_${r.id.replace(/[^a-zA-Z0-9_-]/g, '')}@lembrete-inteligente.app`;
    const title = escapeIcsText(r.titulo);
    const category = escapeIcsText(r.categoria || 'Geral');
    const antMin = Number(r.antecedencia_minutos) || 0;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowUtc}`);
    lines.push(`DTSTART:${startIcs}`);
    lines.push(`DTEND:${endIcs}`);
    lines.push(`SUMMARY:⏰ ${title}`);
    lines.push(`DESCRIPTION:Alarme automático agendado pelo Lembrete Inteligente.\\nCategoria: ${category}\\nStatus: ${r.status_tarefa}`);
    lines.push(`CATEGORIES:${category}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:OPAQUE');

    // NATIVE SYSTEM ALARM 1: Exact Execution Time (rings right at event time)
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:AUDIO');
    lines.push('TRIGGER:-PT0M');
    lines.push(`DESCRIPTION:⏰ ALARME: ${title}`);
    lines.push('ATTACH;VALUE=URI:Chord');
    lines.push('END:VALARM');

    // NATIVE SYSTEM ALARM 2: Display alert on lock screen
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('TRIGGER:-PT0M');
    lines.push(`DESCRIPTION:Horário alcançado: ${title}`);
    lines.push('END:VALARM');

    // Optional Antecedência Alarm
    if (antMin > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`TRIGGER:-PT${antMin}M`);
      lines.push(`DESCRIPTION:Aviso prévio (${antMin} min antes): ${title}`);
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Downloads a single reminder as a .ics file or uses Web Share API so the mobile phone
 * natively offers "Adicionar ao Calendário / Samsung Calendar / Google Agenda".
 */
export async function addReminderToDeviceCalendar(reminder: Lembrete): Promise<{ success: boolean; method: string }> {
  const icsData = buildIcsCalendar([reminder], `Alarme: ${reminder.titulo}`);
  const fileName = `alarme-${reminder.id.slice(-6)}.ics`;

  if (typeof navigator !== 'undefined' && 'share' in navigator && typeof File !== 'undefined') {
    try {
      const file = new File([icsData], fileName, { type: 'text/calendar;charset=utf-8' });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `⏰ Alarme: ${reminder.titulo}`,
          text: `Agendar alarme nativo para ${reminder.titulo}`,
        });
        return { success: true, method: 'share' };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return { success: true, method: 'dismissed' };
      }
    }
  }

  try {
    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1500);
    return { success: true, method: 'download' };
  } catch (err) {
    const gUrl = getGoogleCalendarUrl(reminder);
    window.open(gUrl, '_blank');
    return { success: true, method: 'google' };
  }
}

/**
 * Generates direct Google Calendar web/app template URL.
 * Automatically opens the Google Calendar app on Android phones with alarms pre-filled.
 */
export function getGoogleCalendarUrl(reminder: Lembrete): string {
  const startDate = new Date(reminder.data_hora_execucao);
  const validStart = isNaN(startDate.getTime()) ? new Date() : startDate;
  const endDate = new Date(validStart.getTime() + 15 * 60 * 1000);

  const startUtc = formatToUtcString(validStart);
  const endUtc = formatToUtcString(endDate);

  const title = encodeURIComponent(`⏰ ${reminder.titulo}`);
  const details = encodeURIComponent(
    `Alarme gerado pelo Lembrete Inteligente.\nCategoria: ${reminder.categoria || 'Geral'}\nAntecedência: ${reminder.antecedencia_minutos || 0} min`
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startUtc}/${endUtc}&details=${details}&sf=true&output=xml`;
}

/**
 * Downloads all user reminders as a full .ics calendar bundle.
 */
export function exportAllRemindersToIcs(reminders: Lembrete[], userName = 'Minha Agenda'): void {
  const activeReminders = reminders.filter((r) => r.status_tarefa !== 'concluído');
  const icsData = buildIcsCalendar(activeReminders, `Lembretes - ${userName}`);
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `meus-lembretes-alarmes.ics`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Directly shares or downloads all alarms into the mobile device's native Clock / Calendar app.
 * Opens Samsung Calendar, Google Calendar, or Apple Calendar with sound alarms enabled.
 */
export async function syncAllToDeviceClock(reminders: Lembrete[], userName = 'Minha Agenda'): Promise<{ success: boolean; method: string }> {
  const activeReminders = reminders.filter((r) => r.status_tarefa !== 'concluído');
  if (activeReminders.length === 0) return { success: false, method: 'empty' };

  const icsData = buildIcsCalendar(activeReminders, `Lembretes - ${userName}`);
  const fileName = `alarmes-celular.ics`;

  if (typeof navigator !== 'undefined' && 'share' in navigator && typeof File !== 'undefined') {
    try {
      const file = new File([icsData], fileName, { type: 'text/calendar;charset=utf-8' });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `⏰ Alarmes do Celular (${activeReminders.length} lembretes)`,
          text: `Adicionar todos os alarmes com som diretamente ao seu relógio/agenda nativa.`,
        });
        return { success: true, method: 'share' };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return { success: true, method: 'dismissed' };
    }
  }

  // Fallback direct download of .ics bundle
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1500);
  return { success: true, method: 'download' };
}


/**
 * Returns the live WebCal feed URL for subscribing native calendars (Apple Calendar / Google Calendar).
 */
export function getWebcalFeedUrl(userId: string): { webcal: string; https: string } {
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  const https = `https://${host}/api/calendar/${encodeURIComponent(userId)}/reminders.ics`;
  const webcal = `webcal://${host}/api/calendar/${encodeURIComponent(userId)}/reminders.ics`;
  return { webcal, https };
}

/**
 * Automatically launches the device's native calendar subscription flow.
 * On Android, opens the system calendar or Google Calendar subscription.
 * On iOS, opens the native Apple Calendar subscribe dialog with automatic periodic updates.
 */
export function openAutoCalendarSubscription(userId: string): { success: boolean; method: string } {
  const { webcal, https } = getWebcalFeedUrl(userId);
  if (typeof window === 'undefined') return { success: false, method: 'none' };

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  try {
    if (isIOS) {
      window.location.href = webcal;
      return { success: true, method: 'ios_webcal' };
    }

    if (isAndroid) {
      window.location.href = webcal;
      return { success: true, method: 'android_webcal' };
    }

    window.location.href = webcal;
    return { success: true, method: 'desktop_webcal' };
  } catch (err) {
    console.error('Failed to launch webcal protocol:', err);
    const gcalUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(https)}`;
    window.open(gcalUrl, '_blank');
    return { success: true, method: 'gcal_fallback' };
  }
}

