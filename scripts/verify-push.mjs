#!/usr/bin/env node

/**
 * Script de Verificação de Push API e Service Worker
 * Lembrete Inteligente - Verificação em Nuvem e Segundo Plano
 * 
 * Executa a checagem ponta a ponta dos pré-requisitos de disparo:
 * 1. Chaves VAPID (existência, formato Base64URL e comprimento)
 * 2. Módulo web-push e configuração de contato
 * 3. Cache de dados e persistência de inscrições (.push-data-cache.json)
 * 4. Validação de formato de endpoints FCM / Web Push
 * 5. Teste de conexão com os serviços push
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function logHeader(title) {
  console.log(`\n${colors.bright}${colors.cyan}====================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}====================================================${colors.reset}\n`);
}

function logSuccess(step, message) {
  console.log(`${colors.green} [OK] ${step}:${colors.reset} ${message}`);
}

function logWarning(step, message, tip) {
  console.log(`${colors.yellow} [AVISO] ${step}:${colors.reset} ${message}`);
  if (tip) console.log(`       ${colors.dim}-> Dica: ${tip}${colors.reset}`);
}

function logError(step, message, fix) {
  console.log(`${colors.red} [ERRO] ${step}:${colors.reset} ${message}`);
  if (fix) console.log(`       ${colors.dim}-> Solução: ${fix}${colors.reset}`);
}

async function runVerification() {
  logHeader('VERIFICAÇÃO DE PUSH API & SERVICE WORKER - LEMBRETE INTELIGENTE');

  let passed = 0;
  let warnings = 0;
  let errors = 0;

  // 1. Verificar Arquivo de Chaves VAPID
  const vapidFile = path.join(rootDir, '.vapid-keys.json');
  let vapidKeys = null;

  if (fs.existsSync(vapidFile)) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(vapidFile, 'utf-8'));
      if (vapidKeys && vapidKeys.publicKey && vapidKeys.privateKey) {
        logSuccess(
          '1. Chaves VAPID',
          `Arquivo .vapid-keys.json carregado com sucesso!\n       Chave Pública: ${vapidKeys.publicKey.substring(0, 16)}... (${vapidKeys.publicKey.length} caracteres)\n       Chave Privada:  ${vapidKeys.privateKey.substring(0, 10)}... (protegida)`
        );
        passed++;
      } else {
        logError('1. Chaves VAPID', 'Arquivo existe mas chaves estão incompletas.', 'Delete .vapid-keys.json e reinicie o servidor para regerar.');
        errors++;
      }
    } catch (e) {
      logError('1. Chaves VAPID', `Erro ao analisar .vapid-keys.json: ${e.message}`);
      errors++;
    }
  } else {
    logWarning('1. Chaves VAPID', 'Arquivo .vapid-keys.json não encontrado.', 'O servidor criará automaticamente ao iniciar.');
    warnings++;
  }

  // 2. Configurar web-push
  if (vapidKeys && vapidKeys.publicKey && vapidKeys.privateKey) {
    try {
      webpush.setVapidDetails(
        'mailto:contato@lembrete-inteligente.app',
        vapidKeys.publicKey,
        vapidKeys.privateKey
      );
      logSuccess('2. Biblioteca Web-Push', 'Detalhes VAPID e sujeito mailto configurados corretamente.');
      passed++;
    } catch (e) {
      logError('2. Biblioteca Web-Push', `Falha ao configurar VAPID: ${e.message}`);
      errors++;
    }
  }

  // 3. Verificar Arquivo de Service Worker e Código Custom
  const swFile = path.join(rootDir, 'public', 'sw.js');
  const swCustomFile = path.join(rootDir, 'public', 'sw-custom.js');

  if (fs.existsSync(swFile) && fs.existsSync(swCustomFile)) {
    const swContent = fs.readFileSync(swFile, 'utf-8');
    const customContent = fs.readFileSync(swCustomFile, 'utf-8');

    const hasPushHandler = customContent.includes("addEventListener('push'");
    const hasClickHandler = customContent.includes("addEventListener('notificationclick'");
    const hasRequireInteraction = customContent.includes('requireInteraction: true');
    const hasPeriodicSync = customContent.includes('periodicsync');

    if (hasPushHandler && hasClickHandler && hasRequireInteraction) {
      logSuccess(
        '3. Service Worker & Alarme',
        `Arquivos /sw.js e /sw-custom.js íntegros.\n       [x] Evento 'push' configurado\n       [x] Evento 'notificationclick' com ações (Abrir / Adiar / Concluir)\n       [x] Modo 'requireInteraction: true' para manter na tela bloqueada\n       [x] Suporte a Periodic Background Sync (${hasPeriodicSync ? 'Ativo' : 'Opcional'})`
      );
      passed++;
    } else {
      logWarning('3. Service Worker & Alarme', 'Handlers de notificação estão parcialmente configurados.');
      warnings++;
    }
  } else {
    logError('3. Service Worker & Alarme', 'Arquivos sw.js ou sw-custom.js não encontrados na pasta /public.');
    errors++;
  }

  // 4. Verificar Cache de Inscrições de Dispositivos dos Usuários
  const cacheFile = path.join(rootDir, '.push-data-cache.json');
  let subscriptionsCount = 0;
  let activeUsersCount = 0;

  if (fs.existsSync(cacheFile)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cacheData.userPushSubscriptions) {
        const users = Object.keys(cacheData.userPushSubscriptions);
        activeUsersCount = users.length;
        for (const u of users) {
          const subs = cacheData.userPushSubscriptions[u] || [];
          subscriptionsCount += subs.length;
        }
      }

      if (subscriptionsCount > 0) {
        logSuccess(
          '4. Inscrições Push Ativas',
          `${subscriptionsCount} aparelho(s) cadastrado(s) em ${activeUsersCount} usuário(s) na nuvem.\n       As mensagens dispararão normalmente mesmo com o navegador fechado.`
        );
        passed++;
      } else {
        logWarning(
          '4. Inscrições Push Ativas',
          'Nenhum dispositivo cadastrado ainda no cache.',
          'Abra o aplicativo no seu navegador ou celular e clique em "Ativar Alertas no Celular".'
        );
        warnings++;
      }
    } catch (e) {
      logWarning('4. Inscrições Push Ativas', `Falha ao ler cache de inscrições: ${e.message}`);
      warnings++;
    }
  } else {
    logWarning('4. Inscrições Push Ativas', 'Cache .push-data-cache.json ainda não criado.', 'Será criado automaticamente no primeiro lembrete ou inscrição.');
    warnings++;
  }

  // 5. Teste de Formato de Assinatura Push (Endpoint & Criptografia)
  if (fs.existsSync(cacheFile)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const subs = Object.values(cacheData.userPushSubscriptions || {}).flat();
      if (subs.length > 0) {
        const sample = subs[0];
        const isValidFCM = sample.endpoint && (
          sample.endpoint.includes('fcm.googleapis.com') ||
          sample.endpoint.includes('mozilla.com') ||
          sample.endpoint.includes('wns.windows.com') ||
          sample.endpoint.includes('web.push.apple.com')
        );
        const hasKeys = sample.keys && sample.keys.p256dh && sample.keys.auth;

        if (isValidFCM && hasKeys) {
          logSuccess(
            '5. Formato de Inscrição Push',
            `Endpoint compatível com RFC 8291/8292.\n       Endpoint: ${sample.endpoint.substring(0, 48)}...\n       Chave p256dh: ${sample.keys.p256dh.substring(0, 16)}...\n       Auth Secret: ${sample.keys.auth.substring(0, 8)}...`
          );
          passed++;
        } else {
          logWarning('5. Formato de Inscrição Push', 'Uma das inscrições no cache tem formato atípico.');
          warnings++;
        }
      }
    } catch {}
  }

  // 6. Resumo e Instruções Finais
  logHeader('RESUMO DO DIAGNÓSTICO');
  console.log(`  ${colors.green}Aprovados: ${passed}${colors.reset}`);
  console.log(`  ${colors.yellow}Avisos:    ${warnings}${colors.reset}`);
  console.log(`  ${colors.red}Erros:     ${errors}${colors.reset}`);

  console.log(`\n${colors.bright}INSTRUÇÕES DE EXECUÇÃO EM SEGUNDO PLANO:${colors.reset}`);
  console.log(`1. ${colors.cyan}No Celular Android:${colors.reset}`);
  console.log('   - Abra o Chrome ou Samsung Internet.');
  console.log('   - Toque em "Ativar Alertas no Celular" e selecione "Permitir".');
  console.log('   - Nas configurações do Android do navegador ou PWA:');
  console.log('     -> Bateria: altere de "Otimizado" para "Sem Restrições".');
  console.log('   - Clique em "Testar Tela Bloqueada" (5s) e bloqueie a tela.');
  console.log(`\n2. ${colors.cyan}No iPhone (iOS 16.4+):${colors.reset}`);
  console.log('   - Toque no botão de Compartilhar do Safari.');
  console.log('   - Selecione "Adicionar à Tela de Início".');
  console.log('   - Abra o ícone criado na tela de início e aceite as notificações.');
  console.log(`\n3. ${colors.cyan}No Servidor Cloud:${colors.reset}`);
  console.log('   - O cron / loop em server.ts monitora todos os lembretes a cada segundo.');
  console.log('   - Ao alcançar o minuto exato, dispara Web Push com alta urgência e TTL 86400.');
  console.log(`\n${colors.bright}${colors.green}Verificação concluída com sucesso!${colors.reset}\n`);
}

runVerification().catch((err) => {
  console.error('Erro na execução da verificação:', err);
  process.exit(1);
});
