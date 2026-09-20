-- Migração: chaves uuid, updated_at e exclusão marcada.
--
-- Prepara o banco para o celular trabalhar offline (ver o cabeçalho de
-- schema.sql). Converte as chaves `bigint` em `uuid` mantendo os dados e as
-- ligações entre as tabelas.
--
-- Rode UMA vez, no SQL Editor, e depois rode schema.sql de novo (ele recria a
-- view, a função, os gatilhos e as políticas já no formato novo).
--
-- É tudo uma transação só: se algo falhar no meio, nada muda.
-- Em banco recém-criado por schema.sql (já com uuid), este script não faz nada.

begin;

do $$
declare
  tipo_atual text;
  t text;
begin
  select data_type into tipo_atual
    from information_schema.columns
   where table_schema = 'public' and table_name = 'cultivos' and column_name = 'id';

  if tipo_atual is null then
    raise notice 'Tabela cultivos não existe: rode schema.sql primeiro.';
    return;
  end if;

  if tipo_atual = 'uuid' then
    raise notice 'Banco já está em uuid; nada a fazer.';
    return;
  end if;

  -- A view e a função de gravação falam em bigint; voltam depois, pelo
  -- schema.sql, já com uuid.
  drop view if exists public.cultivos_resumo;
  drop function if exists public.salvar_movimentacao(bigint, bigint, text, text, date, text, jsonb);

  -- ── 1. Chave nova em cada tabela ──────────────────────────────────────────
  alter table public.cultivos            add column id_novo uuid not null default gen_random_uuid();
  alter table public.movimentacoes       add column id_novo uuid not null default gen_random_uuid();
  alter table public.movimentacao_itens  add column id_novo uuid not null default gen_random_uuid();
  alter table public.movimentacao_anexos add column id_novo uuid not null default gen_random_uuid();
  alter table public.pluviometria        add column id_novo uuid not null default gen_random_uuid();
  alter table public.fotos_cultivo       add column id_novo uuid not null default gen_random_uuid();

  -- ── 2. Ligações apontando para a chave nova ───────────────────────────────
  alter table public.movimentacoes       add column cultivo_id_novo uuid;
  alter table public.pluviometria        add column cultivo_id_novo uuid;
  alter table public.fotos_cultivo       add column cultivo_id_novo uuid;
  alter table public.movimentacao_itens  add column movimentacao_id_novo uuid;
  alter table public.movimentacao_anexos add column movimentacao_id_novo uuid;

  update public.movimentacoes f set cultivo_id_novo = p.id_novo
    from public.cultivos p where p.id = f.cultivo_id;
  update public.pluviometria f set cultivo_id_novo = p.id_novo
    from public.cultivos p where p.id = f.cultivo_id;
  update public.fotos_cultivo f set cultivo_id_novo = p.id_novo
    from public.cultivos p where p.id = f.cultivo_id;
  update public.movimentacao_itens f set movimentacao_id_novo = p.id_novo
    from public.movimentacoes p where p.id = f.movimentacao_id;
  update public.movimentacao_anexos f set movimentacao_id_novo = p.id_novo
    from public.movimentacoes p where p.id = f.movimentacao_id;

  -- ── 3. Fora o que é bigint ────────────────────────────────────────────────
  -- Os nomes das chaves estrangeiras são gerados pelo Postgres, então são
  -- descobertos em vez de escritos à mão.
  for t in
    select con.conname || '@' || rel.relname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and con.contype = 'f'
       and rel.relname in ('movimentacoes', 'movimentacao_itens', 'movimentacao_anexos',
                           'pluviometria', 'fotos_cultivo')
       and (pg_get_constraintdef(con.oid) like '%(cultivo_id)%'
            or pg_get_constraintdef(con.oid) like '%(movimentacao_id)%')
  loop
    execute format('alter table public.%I drop constraint %I',
                   split_part(t, '@', 2), split_part(t, '@', 1));
  end loop;

  foreach t in array array['cultivos', 'movimentacoes', 'movimentacao_itens',
                           'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'] loop
    execute format('alter table public.%I drop column id', t);
    execute format('alter table public.%I rename column id_novo to id', t);
    execute format('alter table public.%I add primary key (id)', t);
  end loop;

  alter table public.movimentacoes       drop column cultivo_id;
  alter table public.pluviometria        drop column cultivo_id;
  alter table public.fotos_cultivo       drop column cultivo_id;
  alter table public.movimentacao_itens  drop column movimentacao_id;
  alter table public.movimentacao_anexos drop column movimentacao_id;

  alter table public.movimentacoes       rename column cultivo_id_novo to cultivo_id;
  alter table public.pluviometria        rename column cultivo_id_novo to cultivo_id;
  alter table public.fotos_cultivo       rename column cultivo_id_novo to cultivo_id;
  alter table public.movimentacao_itens  rename column movimentacao_id_novo to movimentacao_id;
  alter table public.movimentacao_anexos rename column movimentacao_id_novo to movimentacao_id;

  -- ── 4. Ligações de volta, agora em uuid ───────────────────────────────────
  alter table public.movimentacoes
    alter column cultivo_id set not null,
    add constraint movimentacoes_cultivo_id_fkey
      foreign key (cultivo_id) references public.cultivos (id) on delete cascade;
  alter table public.pluviometria
    alter column cultivo_id set not null,
    add constraint pluviometria_cultivo_id_fkey
      foreign key (cultivo_id) references public.cultivos (id) on delete cascade;
  alter table public.fotos_cultivo
    alter column cultivo_id set not null,
    add constraint fotos_cultivo_cultivo_id_fkey
      foreign key (cultivo_id) references public.cultivos (id) on delete cascade;
  alter table public.movimentacao_itens
    alter column movimentacao_id set not null,
    add constraint movimentacao_itens_movimentacao_id_fkey
      foreign key (movimentacao_id) references public.movimentacoes (id) on delete cascade;
  alter table public.movimentacao_anexos
    alter column movimentacao_id set not null,
    add constraint movimentacao_anexos_movimentacao_id_fkey
      foreign key (movimentacao_id) references public.movimentacoes (id) on delete cascade;

  create index if not exists movimentacoes_cultivo_idx on public.movimentacoes (cultivo_id);
  create index if not exists pluviometria_cultivo_idx on public.pluviometria (cultivo_id, data);
  create index if not exists fotos_cultivo_cultivo_idx on public.fotos_cultivo (cultivo_id);
  create index if not exists movimentacao_itens_mov_idx on public.movimentacao_itens (movimentacao_id);
  create index if not exists movimentacao_anexos_mov_idx on public.movimentacao_anexos (movimentacao_id);

  raise notice 'Chaves convertidas para uuid.';
end $$;

-- ── 5. Colunas de sincronização ──────────────────────────────────────────────
-- Fora do bloco acima porque valem também para quem já está em uuid.
do $$
declare
  t text;
begin
  foreach t in array array['cultivos', 'movimentacoes', 'movimentacao_itens',
                           'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('create index if not exists %I on public.%I (updated_at)', t || '_updated_idx', t);
  end loop;

  alter table public.movimentacoes       add column if not exists created_at timestamptz not null default now();
  alter table public.movimentacao_anexos add column if not exists created_at timestamptz not null default now();
end $$;

commit;

-- Depois disto, rode supabase/schema.sql de novo: ele recria a view
-- cultivos_resumo, a função salvar_movimentacao (agora em uuid), os gatilhos de
-- updated_at e de exclusão em cascata, e as políticas.
