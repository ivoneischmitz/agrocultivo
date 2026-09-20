-- Agro Cultivo — schema do Supabase.
--
-- Rode no SQL Editor do projeto (efpghgwlvmrnnsmwhohy). Pode rodar de novo sem
-- erro: tudo é "if not exists" / "or replace". Num banco que já existe desde
-- antes das chaves uuid, rode supabase/migracao-uuid.sql em vez deste.
--
-- Modelo de acesso: cada produtor vê só o que é dele. Toda tabela tem
-- user_id (preenchido sozinho com auth.uid()) e a RLS compara com quem está
-- logado. É o oposto do Força de Vendas, onde as tabelas são compartilhadas —
-- aqui cada conta é uma fazenda diferente, e o cadastro de conta é aberto.
--
-- ── Preparado para funcionar offline no celular ──────────────────────────────
-- Três decisões existem por causa disso (ver o plano no README):
--
-- 1. `id` é uuid gerado por quem cria a linha, não uma sequência do Postgres.
--    Sem isso o aparelho não consegue criar uma despesa e amarrar os itens
--    nela antes de ter rede.
-- 2. `updated_at` em toda tabela, mexido por gatilho. É como o aparelho pede
--    "o que mudou desde a última sincronização" em vez de baixar tudo.
-- 3. Exclusão é marcada em `deleted_at`, não apagada. Linha que some do
--    Postgres é invisível para um aparelho offline, e voltaria do túmulo na
--    próxima subida.

-- ── Perfil ───────────────────────────────────────────────────────────────────
create table if not exists public.perfis (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nome text,
  nome_sitio text,
  proprietario text,
  uf text,
  municipio text,
  updated_at timestamptz not null default now()
);

-- ── Cultivos ─────────────────────────────────────────────────────────────────
-- area_hectares era `quantidade_alqueire` no app antigo, que apesar do nome
-- sempre guardou hectares (a tela convertia para alqueires só na exibição).
create table if not exists public.cultivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome_cultura text not null,
  ano text not null,
  localidade text not null,
  area_hectares numeric(14, 2) not null default 0,
  numero_sacas numeric(14, 2) not null default 0,
  valor_gerado numeric(14, 2) not null default 0,
  finalizado boolean not null default false,
  latitude double precision,
  longitude double precision,
  data_plantio date,
  ciclo_dias integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cultivos_user_idx on public.cultivos (user_id);

-- ── Movimentações (despesas e receitas) ──────────────────────────────────────
-- A movimentação é só o cabeçalho; o valor está nos itens (quantidade × valor).
create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cultivo_id uuid not null references public.cultivos (id) on delete cascade,
  tipo text not null default 'DESPESA' check (tipo in ('DESPESA', 'RECEITA')),
  descricao text not null,
  data date not null,
  categoria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists movimentacoes_cultivo_idx on public.movimentacoes (cultivo_id);

create table if not exists public.movimentacao_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movimentacao_id uuid not null references public.movimentacoes (id) on delete cascade,
  descricao text not null,
  unidade text not null default 'UN - Unidade',
  quantidade numeric(14, 4) not null default 0,
  valor numeric(14, 4) not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists movimentacao_itens_mov_idx on public.movimentacao_itens (movimentacao_id);

-- Arquivos ficam no Storage (bucket privado `anexos`); aqui só o caminho.
create table if not exists public.movimentacao_anexos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movimentacao_id uuid not null references public.movimentacoes (id) on delete cascade,
  storage_path text not null,
  nome_arquivo text not null,
  tipo_arquivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists movimentacao_anexos_mov_idx on public.movimentacao_anexos (movimentacao_id);

-- ── Pluviometria ─────────────────────────────────────────────────────────────
create table if not exists public.pluviometria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cultivo_id uuid not null references public.cultivos (id) on delete cascade,
  data date not null,
  milimetros numeric(8, 2) not null default 0,
  observacao text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists pluviometria_cultivo_idx on public.pluviometria (cultivo_id, data);

-- ── Fotos ────────────────────────────────────────────────────────────────────
-- Bucket público `fotos-cultivo`, o mesmo do app antigo, em {user_id}/arquivo.
create table if not exists public.fotos_cultivo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cultivo_id uuid not null references public.cultivos (id) on delete cascade,
  storage_path text not null,
  url text not null,
  comentario text,
  data timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists fotos_cultivo_cultivo_idx on public.fotos_cultivo (cultivo_id);

-- ── updated_at automático ────────────────────────────────────────────────────
-- Mexido por gatilho, e não pelo app: o aparelho pede o que mudou desde a
-- última sincronização, e uma gravação que esquecesse de atualizar a coluna
-- nunca seria baixada de volta.
create or replace function public.marcar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Exclusão marcada em cascata ──────────────────────────────────────────────
-- A cascata do Postgres só vale para o DELETE de verdade. Marcando um cultivo
-- como excluído, os filhos precisam ser marcados junto, senão continuariam
-- ativos para o aparelho que só baixa o que mudou.
create or replace function public.propagar_exclusao_cultivo()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.movimentacoes set deleted_at = new.deleted_at
      where cultivo_id = new.id and deleted_at is null;
    update public.pluviometria set deleted_at = new.deleted_at
      where cultivo_id = new.id and deleted_at is null;
    update public.fotos_cultivo set deleted_at = new.deleted_at
      where cultivo_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;

create or replace function public.propagar_exclusao_movimentacao()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.movimentacao_itens set deleted_at = new.deleted_at
      where movimentacao_id = new.id and deleted_at is null;
    update public.movimentacao_anexos set deleted_at = new.deleted_at
      where movimentacao_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'perfis', 'cultivos', 'movimentacoes', 'movimentacao_itens',
    'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_updated_at before update on public.%I
         for each row execute function public.marcar_updated_at()',
      t, t
    );
  end loop;
end $$;

drop trigger if exists cultivos_exclusao on public.cultivos;
create trigger cultivos_exclusao after update of deleted_at on public.cultivos
  for each row execute function public.propagar_exclusao_cultivo();

drop trigger if exists movimentacoes_exclusao on public.movimentacoes;
create trigger movimentacoes_exclusao after update of deleted_at on public.movimentacoes
  for each row execute function public.propagar_exclusao_movimentacao();

-- ── RLS: cada um só o seu ────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'perfis', 'cultivos', 'movimentacoes', 'movimentacao_itens',
    'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- ── Totais por cultivo ───────────────────────────────────────────────────────
-- Uma consulta traz a lista de cultivos já com despesas, receitas e chuva —
-- no app antigo eram três consultas por cartão. security_invoker faz a view
-- respeitar a RLS de quem consulta, em vez da do dono da view.
create or replace view public.cultivos_resumo
with (security_invoker = true) as
select
  c.*,
  coalesce((
    select sum(i.quantidade * i.valor)
    from public.movimentacoes m
    join public.movimentacao_itens i on i.movimentacao_id = m.id
    where m.cultivo_id = c.id and m.tipo = 'DESPESA'
      and m.deleted_at is null and i.deleted_at is null
  ), 0)::float8 as total_despesas,
  coalesce((
    select sum(i.quantidade * i.valor)
    from public.movimentacoes m
    join public.movimentacao_itens i on i.movimentacao_id = m.id
    where m.cultivo_id = c.id and m.tipo = 'RECEITA'
      and m.deleted_at is null and i.deleted_at is null
  ), 0)::float8 as total_receitas,
  coalesce((
    select sum(p.milimetros) from public.pluviometria p
     where p.cultivo_id = c.id and p.deleted_at is null
  ), 0)::float8 as total_chuva
from public.cultivos c
where c.deleted_at is null;

-- ── Gravar movimentação + itens numa transação só ───────────────────────────
-- Editar troca todos os itens. Feito no cliente seriam três chamadas (cabeçalho,
-- apagar itens, inserir itens), e uma falha no meio deixaria a despesa sem
-- valor. Aqui tudo vale ou nada vale. security invoker: roda com a RLS de quem
-- chamou, então não dá para gravar no cultivo de outra pessoa.
--
-- p_id vem preenchido também ao CRIAR: o aparelho gera o uuid antes de ter
-- rede. Por isso é insert ... on conflict, e não "se null insere".
create or replace function public.salvar_movimentacao(
  p_id uuid,
  p_cultivo_id uuid,
  p_tipo text,
  p_descricao text,
  p_data date,
  p_categoria text,
  p_itens jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into movimentacoes (id, cultivo_id, tipo, descricao, data, categoria)
  values (coalesce(p_id, gen_random_uuid()), p_cultivo_id, p_tipo, p_descricao, p_data, p_categoria)
  on conflict (id) do update
    set descricao = excluded.descricao,
        data = excluded.data,
        categoria = excluded.categoria,
        deleted_at = null
  returning id into v_id;

  delete from movimentacao_itens where movimentacao_id = v_id;

  insert into movimentacao_itens (id, movimentacao_id, descricao, unidade, quantidade, valor)
  select coalesce((item ->> 'id')::uuid, gen_random_uuid()),
         v_id,
         item ->> 'descricao',
         coalesce(nullif(item ->> 'unidade', ''), 'UN - Unidade'),
         coalesce((item ->> 'quantidade')::numeric, 0),
         coalesce((item ->> 'valor')::numeric, 0)
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as item
   where coalesce(trim(item ->> 'descricao'), '') <> '';

  return v_id;
end;
$$;

-- ── Storage ──────────────────────────────────────────────────────────────────
-- fotos-cultivo já existia (público). anexos é novo e privado: nota fiscal não
-- deve ficar acessível por link aberto; o app gera um link temporário.
insert into storage.buckets (id, name, public)
values ('fotos-cultivo', 'fotos-cultivo', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

-- Cada usuário escreve/lê só na pasta com o próprio id.
drop policy if exists "agro: dono le" on storage.objects;
create policy "agro: dono le" on storage.objects for select to authenticated
  using (bucket_id in ('fotos-cultivo', 'anexos') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agro: dono grava" on storage.objects;
create policy "agro: dono grava" on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos-cultivo', 'anexos') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agro: dono altera" on storage.objects;
create policy "agro: dono altera" on storage.objects for update to authenticated
  using (bucket_id in ('fotos-cultivo', 'anexos') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "agro: dono apaga" on storage.objects;
create policy "agro: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id in ('fotos-cultivo', 'anexos') and (storage.foldername(name))[1] = auth.uid()::text);
