import * as SQLite from 'expo-sqlite';

// Cópia local dos dados, no celular.
//
// É o que faz o app funcionar sem sinal: as telas leem e gravam aqui, e
// lib/sync.native.ts leva e traz do Supabase quando há internet. Só existe no
// Android e no iOS — na web o app continua falando direto com o Supabase (o
// Metro escolhe o arquivo pela plataforma, como em MapaLeaflet).
//
// As tabelas espelham as do Postgres (supabase/schema.sql e fazendas.sql), com
// duas colunas a mais:
//
//   pendente  1 quando a linha foi criada ou alterada aqui e ainda não subiu.
//   Fica em 0 depois que a sincronização confirma.
//
// E uma tabela de controle, `sync_estado`, com a data da última busca por
// tabela: é assim que o celular pede "o que mudou desde então" em vez de
// baixar tudo toda vez.
//
// Datas e números seguem o formato do Postgres (ISO e ponto decimal) para
// atravessarem os dois lados sem conversão.

const db = SQLite.openDatabaseSync('agrocultivo.db');

db.execSync(`
  pragma journal_mode = WAL;

  create table if not exists cultivos (
    id text primary key,
    fazenda_id text not null,
    user_id text,
    nome_cultura text not null,
    ano text not null,
    localidade text not null,
    area_hectares real not null default 0,
    numero_sacas real not null default 0,
    valor_gerado real not null default 0,
    finalizado integer not null default 0,
    latitude real,
    longitude real,
    data_plantio text,
    ciclo_dias integer not null default 120,
    created_at text,
    updated_at text,
    deleted_at text,
    pendente integer not null default 0
  );

  create table if not exists movimentacoes (
    id text primary key,
    fazenda_id text not null,
    cultivo_id text not null,
    tipo text not null default 'DESPESA',
    descricao text not null,
    data text not null,
    categoria text,
    created_at text,
    updated_at text,
    deleted_at text,
    pendente integer not null default 0
  );

  create table if not exists movimentacao_itens (
    id text primary key,
    fazenda_id text not null,
    movimentacao_id text not null,
    descricao text not null,
    unidade text not null default 'UN - Unidade',
    quantidade real not null default 0,
    valor real not null default 0,
    updated_at text,
    deleted_at text
  );

  create table if not exists movimentacao_anexos (
    id text primary key,
    fazenda_id text not null,
    movimentacao_id text not null,
    storage_path text not null,
    nome_arquivo text not null,
    tipo_arquivo text,
    updated_at text,
    deleted_at text
  );

  create table if not exists pluviometria (
    id text primary key,
    fazenda_id text not null,
    cultivo_id text not null,
    data text not null,
    milimetros real not null default 0,
    observacao text,
    updated_at text,
    deleted_at text,
    pendente integer not null default 0
  );

  create table if not exists fotos_cultivo (
    id text primary key,
    fazenda_id text not null,
    cultivo_id text not null,
    storage_path text not null,
    url text not null,
    comentario text,
    data text,
    updated_at text,
    deleted_at text
  );

  create table if not exists fazendas (
    id text primary key,
    nome text not null,
    nome_sitio text,
    proprietario text,
    uf text,
    municipio text,
    dono_id text,
    updated_at text,
    deleted_at text
  );

  create table if not exists sync_estado (
    tabela text primary key,
    ultima_busca text
  );

  create index if not exists mov_cultivo on movimentacoes (cultivo_id);
  create index if not exists itens_mov on movimentacao_itens (movimentacao_id);
  create index if not exists anexos_mov on movimentacao_anexos (movimentacao_id);
  create index if not exists chuva_cultivo on pluviometria (cultivo_id);
  create index if not exists fotos_cultivo_idx on fotos_cultivo (cultivo_id);
`);

export { db };

export type LinhaSync = Record<string, unknown> & { id: string };

// Grava a linha que veio do servidor sem passar por cima de alteração local
// ainda não enviada: se pendente = 1, o que vale é o daqui até subir.
export function guardarDoServidor(tabela: string, linha: LinhaSync, temPendente: boolean): void {
  if (temPendente) {
    const atual = db.getFirstSync<{ pendente: number }>(
      `select pendente from ${tabela} where id = ?`,
      linha.id,
    );
    if (atual?.pendente === 1) return;
  }

  const colunas = Object.keys(linha);
  const valores = colunas.map((c) => {
    const v = linha[c];
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === undefined) return null;
    return v as string | number | null;
  });

  db.runSync(
    `insert or replace into ${tabela} (${colunas.join(', ')}${temPendente ? ', pendente' : ''})
     values (${colunas.map(() => '?').join(', ')}${temPendente ? ', 0' : ''})`,
    valores,
  );
}

export function marcarEnviado(tabela: string, id: string): void {
  db.runSync(`update ${tabela} set pendente = 0 where id = ?`, id);
}

export function ultimaBusca(tabela: string): string | null {
  return db.getFirstSync<{ ultima_busca: string }>(
    'select ultima_busca from sync_estado where tabela = ?',
    tabela,
  )?.ultima_busca ?? null;
}

export function anotarBusca(tabela: string, quando: string): void {
  db.runSync(
    'insert or replace into sync_estado (tabela, ultima_busca) values (?, ?)',
    tabela,
    quando,
  );
}

// Quantas alterações ainda não subiram — o app mostra isso ao lado do
// indicador de conexão.
export function totalPendente(): number {
  const linha = db.getFirstSync<{ total: number }>(`
    select
      (select count(*) from cultivos where pendente = 1) +
      (select count(*) from movimentacoes where pendente = 1) +
      (select count(*) from pluviometria where pendente = 1) as total
  `);
  return linha?.total ?? 0;
}

// Ao trocar de conta, o que está no aparelho é de outra pessoa.
export function limparTudo(): void {
  db.execSync(`
    delete from movimentacao_itens;
    delete from movimentacao_anexos;
    delete from movimentacoes;
    delete from pluviometria;
    delete from fotos_cultivo;
    delete from cultivos;
    delete from fazendas;
    delete from sync_estado;
  `);
}

// Identificador criado no aparelho, para a linha existir antes de haver rede.
// É o motivo de as chaves do banco serem uuid (ver supabase/fazendas.sql).
export function novoId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function agora(): string {
  return new Date().toISOString();
}
