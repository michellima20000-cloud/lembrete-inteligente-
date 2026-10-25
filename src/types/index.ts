export type StatusTarefa = 'pendente' | 'concluído' | 'adiado';

export type RecorrenciaTipo = 'nenhuma' | 'diaria' | 'semanal';

export interface Lembrete {
  id: string;
  user_id: string;
  titulo: string;
  data_hora_execucao: string; // ISO AAAA-MM-DDTHH:MM:SS
  timestamp_execucao?: number; // Absolute UTC Epoch Milliseconds
  timezone_offset_minutes?: number; // Timezone offset in minutes (e.g. 180 for UTC-3)
  antecedencia_minutos: number; // 0, 5, 10, 15, 30
  status_tarefa: StatusTarefa;
  categoria?: string;
  urgencia?: 'baixa' | 'media' | 'alta';
  recorrencia?: RecorrenciaTipo;
  dias_semana?: number[]; // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
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

export interface AiParseResponse {
  status: 'sucesso' | 'erro';
  user_id: string;
  lembrete: {
    id?: string;
    titulo: string;
    data_hora_execucao: string;
    timestamp_execucao?: number;
    timezone_offset_minutes?: number;
    status_tarefa: StatusTarefa;
    antecedencia_minutos?: number;
    categoria?: string;
    urgencia?: 'baixa' | 'media' | 'alta';
    recorrencia?: RecorrenciaTipo;
    dias_semana?: number[];
  };
  mensagem_sistema: string;
}
