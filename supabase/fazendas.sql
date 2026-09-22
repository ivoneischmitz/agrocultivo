-- Fazendas compartilhadas: mais de uma pessoa na mesma base.
--
-- Rode depois de supabase/schema.sql. Pode rodar de novo sem erro.
--
-- ── O que muda ───────────────────────────────────────────────────────────────
-- Antes o dono do dado era a PESSOA: toda tabela tinha user_id = auth.uid() e a
-- regra de acesso comparava com quem estava logado. Assim, o que um convidado
-- lançasse nasceria como dado dele, e a conta da safra se dividiria em duas.
--
-- Agora o dono do dado é a FAZENDA, e as pessoas são membros dela. O user_id
-- continua nas tabelas, mas com outro sentido: passa a ser "quem lançou", que é
-- justamente o que interessa saber quando duas pessoas mexem na mesma base.
--
-- Decisões (combinadas com o dono do projeto):
--   • Todo membro pode tudo. O papel só distingue quem criou a fazenda (dono),
--     que é quem pode remover gente e apagar a fazenda.
--   • Qualquer membro pode convidar.
--   • O convite é um link aberto, de uso único, que vence em 7 dias e pode ser
--     cancelado antes.
--   • Uma pessoa pode participar de várias fazendas e trocar dentro do app.

-- ── Tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.fazendas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Estes campos vinham de `perfis`: são da fazenda, não da pessoa, e por isso
  -- passam a ser vistos por todos os membros.
  nome_sitio text,
  proprietario text,
  uf text,
  municipio text,
  dono_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.fazenda_membros (
  fazenda_id uuid not null references public.fazendas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  created_at timestamptz not null default now(),
  primary key (fazenda_id, user_id)
);
create index if not exists fazenda_membros_user_idx on public.fazenda_membros (user_id);

create table if not exists public.convites (
  token text primary key,
  fazenda_id uuid not null references public.fazendas (id) on delete cascade,
  criado_por uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_em timestamptz,
  usado_por uuid references auth.users (id) on delete set null,
  cancelado_em timestamptz
);
create index if not exists convites_fazenda_idx on public.convites (fazenda_id);

-- ── Quem sou eu, onde eu entro ───────────────────────────────────────────────
-- security definer de propósito: a política de acesso das próprias tabelas usa
-- estas funções, e uma consulta comum a fazenda_membros dispararia a política
-- dela mesma, em recursão infinita.
create or replace function public.minhas_fazendas()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select fazenda_id from fazenda_membros where user_id = auth.uid();
$$;

create or replace function public.sou_dono(p_fazenda uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from fazenda_membros
     where fazenda_id = p_fazenda and user_id = auth.uid() and papel = 'dono'
  );
$$;

-- Fazenda usada quando o app não manda uma explicitamente (a mais antiga da
-- pessoa). Serve de rede de segurança; o app sempre manda.
create or replace function public.fazenda_padrao()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.fazenda_id
    from fazenda_membros m
    join fazendas f on f.id = m.fazenda_id
   where m.user_id = auth.uid() and f.deleted_at is null
   order by m.created_at
   limit 1;
$$;

-- Conta nova entra sem fazenda nenhuma; o app chama isto depois do login.
create or replace function public.garantir_fazenda()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;

  select fazenda_padrao() into v_id;
  if v_id is not null then
    return v_id;
  end if;

  insert into fazendas (nome, dono_id) values ('Minha fazenda', auth.uid()) returning id into v_id;
  insert into fazenda_membros (fazenda_id, user_id, papel) values (v_id, auth.uid(), 'dono');
  return v_id;
end;
$$;

-- ── fazenda_id nas tabelas de dados ──────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['cultivos', 'movimentacoes', 'movimentacao_itens',
                           'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'] loop
    execute format(
      'alter table public.%I add column if not exists fazenda_id uuid references public.fazendas (id) on delete cascade',
      t
    );
    execute format('create index if not exists %I on public.%I (fazenda_id)', t || '_fazenda_idx', t);
  end loop;
end $$;

-- ── Migração dos dados que já existem ────────────────────────────────────────
-- Cada conta que já tem dados (ou perfil) vira uma fazenda com ela mesma como
-- dona. Quem usa sozinho não percebe diferença.
do $$
declare
  u record;
  v_fazenda uuid;
  tem_campos_antigos boolean;
  consulta text;
begin
  -- Na primeira vez, `perfis` ainda tem os campos da fazenda e eles vêm junto.
  -- Numa segunda execução esses campos já saíram, então a consulta é outra —
  -- daí o SQL montado em texto, que só é analisado na hora de rodar.
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'perfis' and column_name = 'nome_sitio'
  ) into tem_campos_antigos;

  if tem_campos_antigos then
    consulta := $q$
      select p.user_id,
             nullif(trim(coalesce(p.nome_sitio, '')), '') as sitio,
             p.proprietario, p.uf, p.municipio
        from public.perfis p
      union
      select distinct c.user_id, null, null, null, null from public.cultivos c
    $q$;
  else
    consulta := $q$
      select p.user_id, null::text as sitio, null::text, null::text, null::text
        from public.perfis p
      union
      select distinct c.user_id, null, null, null, null from public.cultivos c
    $q$;
  end if;

  for u in execute consulta loop
    -- o union pode trazer a mesma pessoa duas vezes (com e sem perfil)
    if exists (select 1 from public.fazenda_membros m where m.user_id = u.user_id) then
      continue;
    end if;

    insert into public.fazendas (nome, nome_sitio, proprietario, uf, municipio, dono_id)
    values (coalesce(u.sitio, 'Minha fazenda'), u.sitio, u.proprietario, u.uf, u.municipio, u.user_id)
    returning id into v_fazenda;

    insert into public.fazenda_membros (fazenda_id, user_id, papel)
    values (v_fazenda, u.user_id, 'dono');
  end loop;
end $$;

-- Liga cada linha à fazenda de quem a criou. Os filhos vão pelo pai, e não pelo
-- user_id, porque numa base compartilhada o item pode ter sido lançado por
-- outra pessoa.
update public.cultivos c
   set fazenda_id = m.fazenda_id
  from public.fazenda_membros m
 where m.user_id = c.user_id and m.papel = 'dono' and c.fazenda_id is null;

update public.movimentacoes f set fazenda_id = c.fazenda_id
  from public.cultivos c where c.id = f.cultivo_id and f.fazenda_id is null;
update public.pluviometria f set fazenda_id = c.fazenda_id
  from public.cultivos c where c.id = f.cultivo_id and f.fazenda_id is null;
update public.fotos_cultivo f set fazenda_id = c.fazenda_id
  from public.cultivos c where c.id = f.cultivo_id and f.fazenda_id is null;
update public.movimentacao_itens i set fazenda_id = m.fazenda_id
  from public.movimentacoes m where m.id = i.movimentacao_id and i.fazenda_id is null;
update public.movimentacao_anexos a set fazenda_id = m.fazenda_id
  from public.movimentacoes m where m.id = a.movimentacao_id and a.fazenda_id is null;

-- Só agora a coluna vira obrigatória: linhas órfãs (se houver) apareceriam aqui
-- em vez de passar batido.
do $$
declare
  t text;
  orfas bigint;
begin
  foreach t in array array['cultivos', 'movimentacoes', 'movimentacao_itens',
                           'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'] loop
    execute format('select count(*) from public.%I where fazenda_id is null', t) into orfas;
    if orfas > 0 then
      raise exception 'Tabela % tem % linha(s) sem fazenda; confira antes de continuar.', t, orfas;
    end if;
    execute format('alter table public.%I alter column fazenda_id set not null', t);
    execute format('alter table public.%I alter column fazenda_id set default public.fazenda_padrao()', t);
  end loop;
end $$;

-- ── Filho herda a fazenda do pai ─────────────────────────────────────────────
-- Assim o app só precisa informar a fazenda ao criar um cultivo; despesa,
-- item, anexo, chuva e foto vêm junto pelo caminho.
create or replace function public.herdar_fazenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fazenda uuid;
begin
  if tg_table_name in ('movimentacoes', 'pluviometria', 'fotos_cultivo') then
    select fazenda_id into v_fazenda from cultivos where id = new.cultivo_id;
  else
    select fazenda_id into v_fazenda from movimentacoes where id = new.movimentacao_id;
  end if;

  if v_fazenda is null then
    raise exception 'Registro pai não encontrado.';
  end if;
  new.fazenda_id := v_fazenda;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['movimentacoes', 'movimentacao_itens', 'movimentacao_anexos',
                           'pluviometria', 'fotos_cultivo'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_herda_fazenda', t);
    execute format(
      'create trigger %I before insert on public.%I
         for each row execute function public.herdar_fazenda()',
      t || '_herda_fazenda', t
    );
  end loop;
end $$;

-- ── Acesso: sou membro da fazenda ────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['cultivos', 'movimentacoes', 'movimentacao_itens',
                           'movimentacao_anexos', 'pluviometria', 'fotos_cultivo'] loop
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('drop policy if exists "membro da fazenda" on public.%I', t);
    execute format(
      'create policy "membro da fazenda" on public.%I for all to authenticated
         using (fazenda_id in (select public.minhas_fazendas()))
         with check (fazenda_id in (select public.minhas_fazendas()))',
      t
    );
  end loop;
end $$;

alter table public.fazendas enable row level security;
alter table public.fazenda_membros enable row level security;
alter table public.convites enable row level security;

drop policy if exists "membros leem" on public.fazendas;
create policy "membros leem" on public.fazendas for select to authenticated
  using (id in (select public.minhas_fazendas()));

drop policy if exists "membros alteram" on public.fazendas;
create policy "membros alteram" on public.fazendas for update to authenticated
  using (id in (select public.minhas_fazendas()))
  with check (id in (select public.minhas_fazendas()));

drop policy if exists "criar a propria" on public.fazendas;
create policy "criar a propria" on public.fazendas for insert to authenticated
  with check (dono_id = auth.uid());

drop policy if exists "dono apaga" on public.fazendas;
create policy "dono apaga" on public.fazendas for delete to authenticated
  using (public.sou_dono(id));

drop policy if exists "ver membros" on public.fazenda_membros;
create policy "ver membros" on public.fazenda_membros for select to authenticated
  using (fazenda_id in (select public.minhas_fazendas()));

-- Sair da fazenda (a própria linha) ou, sendo dono, tirar alguém.
drop policy if exists "sair ou remover" on public.fazenda_membros;
create policy "sair ou remover" on public.fazenda_membros for delete to authenticated
  using (user_id = auth.uid() or public.sou_dono(fazenda_id));

-- Entrar é só pela função aceitar_convite: não existe política de insert aqui.

drop policy if exists "convites da fazenda" on public.convites;
create policy "convites da fazenda" on public.convites for select to authenticated
  using (fazenda_id in (select public.minhas_fazendas()));

drop policy if exists "membro convida" on public.convites;
create policy "membro convida" on public.convites for insert to authenticated
  with check (fazenda_id in (select public.minhas_fazendas()) and criado_por = auth.uid());

drop policy if exists "membro cancela" on public.convites;
create policy "membro cancela" on public.convites for update to authenticated
  using (fazenda_id in (select public.minhas_fazendas()))
  with check (fazenda_id in (select public.minhas_fazendas()));

-- ── Aceitar convite ──────────────────────────────────────────────────────────
-- Quem chega pelo link ainda não é membro, então não enxerga nem o convite nem
-- a fazenda: por isso a entrada acontece aqui dentro, onde as regras de acesso
-- não valem, e cada condição do convite é conferida no servidor.
create or replace function public.aceitar_convite(p_token text)
returns table (id_fazenda uuid, nome_fazenda text, ja_era_membro boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_ja boolean;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  select * into c from convites where token = p_token;
  if not found then
    raise exception 'Convite não encontrado.';
  end if;
  if c.cancelado_em is not null then
    raise exception 'Este convite foi cancelado.';
  end if;
  if c.expira_em < now() then
    raise exception 'Este convite venceu. Peça um novo.';
  end if;

  select exists (
    select 1 from fazenda_membros m where m.fazenda_id = c.fazenda_id and m.user_id = auth.uid()
  ) into v_ja;

  -- Uso único, mas quem já é membro pode reabrir o link sem levar erro.
  if c.usado_em is not null and not v_ja then
    raise exception 'Este convite já foi usado.';
  end if;

  if not v_ja then
    insert into fazenda_membros (fazenda_id, user_id, papel)
    values (c.fazenda_id, auth.uid(), 'membro');

    update convites set usado_em = now(), usado_por = auth.uid() where token = p_token;
  end if;

  return query
    select f.id, f.nome, v_ja from fazendas f where f.id = c.fazenda_id;
end;
$$;

revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;

-- ── Storage por fazenda ──────────────────────────────────────────────────────
-- Arquivo novo vai para {fazenda_id}/..., e não mais para {user_id}/..., senão
-- o sócio não conseguiria abrir a foto que o outro tirou. A leitura também
-- aceita o caminho antigo quando existe uma linha da fazenda apontando para
-- ele, para os arquivos que já estavam lá continuarem abrindo.
create or replace function public.pasta_e_minha_fazenda(caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from fazenda_membros m
     where m.user_id = auth.uid()
       and m.fazenda_id::text = (storage.foldername(caminho))[1]
  );
$$;

create or replace function public.arquivo_e_da_minha_fazenda(caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from fotos_cultivo f
     where f.storage_path = caminho
       and f.fazenda_id in (select fazenda_id from fazenda_membros where user_id = auth.uid())
  ) or exists (
    select 1 from movimentacao_anexos a
     where a.storage_path = caminho
       and a.fazenda_id in (select fazenda_id from fazenda_membros where user_id = auth.uid())
  );
$$;

drop policy if exists "agro: dono le" on storage.objects;
drop policy if exists "agro: dono grava" on storage.objects;
drop policy if exists "agro: dono altera" on storage.objects;
drop policy if exists "agro: dono apaga" on storage.objects;

drop policy if exists "agro: fazenda le" on storage.objects;
create policy "agro: fazenda le" on storage.objects for select to authenticated
  using (
    bucket_id in ('fotos-cultivo', 'anexos')
    and (
      public.pasta_e_minha_fazenda(name)
      or (storage.foldername(name))[1] = auth.uid()::text   -- pasta antiga, da própria pessoa
      or public.arquivo_e_da_minha_fazenda(name)            -- pasta antiga, de outro membro
    )
  );

drop policy if exists "agro: fazenda grava" on storage.objects;
create policy "agro: fazenda grava" on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos-cultivo', 'anexos') and public.pasta_e_minha_fazenda(name));

drop policy if exists "agro: fazenda altera" on storage.objects;
create policy "agro: fazenda altera" on storage.objects for update to authenticated
  using (bucket_id in ('fotos-cultivo', 'anexos') and public.pasta_e_minha_fazenda(name));

drop policy if exists "agro: fazenda apaga" on storage.objects;
create policy "agro: fazenda apaga" on storage.objects for delete to authenticated
  using (
    bucket_id in ('fotos-cultivo', 'anexos')
    and (
      public.pasta_e_minha_fazenda(name)
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.arquivo_e_da_minha_fazenda(name)
    )
  );

-- ── updated_at nas tabelas novas ─────────────────────────────────────────────
drop trigger if exists fazendas_updated_at on public.fazendas;
create trigger fazendas_updated_at before update on public.fazendas
  for each row execute function public.marcar_updated_at();

-- ── Totais por cultivo, agora com a fazenda junto ────────────────────────────
-- Removida antes de recriar: a view expõe c.*, e quando a tabela ganha uma
-- coluna nova o "create or replace" esbarra na ordem das colunas
-- (cannot change name of view column ...).
drop view if exists public.cultivos_resumo;
create view public.cultivos_resumo
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
  ), 0)::float8 as total_chuva,
  -- A despesa mais antiga do cultivo. Junto com a data de plantio, é o que
  -- diz se a safra já começou: sem nenhuma das duas no passado, ela ainda
  -- está por vir (filtro "Aguardando início" na tela de cultivos).
  (
    select min(m.data) from public.movimentacoes m
     where m.cultivo_id = c.id and m.tipo = 'DESPESA' and m.deleted_at is null
  ) as primeira_despesa
from public.cultivos c
where c.deleted_at is null;

-- ── perfis: só a pessoa ──────────────────────────────────────────────────────
-- Sítio, proprietário, UF e município passaram para `fazendas` no bloco de
-- migração acima; aqui sobra o nome de quem usa o app.
alter table public.perfis drop column if exists nome_sitio;
alter table public.perfis drop column if exists proprietario;
alter table public.perfis drop column if exists uf;
alter table public.perfis drop column if exists municipio;

-- ── Quem está na fazenda ─────────────────────────────────────────────────────
-- A tabela de membros guarda só o id da pessoa, e uma conta não enxerga os
-- dados de outra (nem auth.users, nem o perfil alheio). Esta função, que roda
-- com privilégio, devolve o mínimo para a tela: nome, e-mail e papel — e só
-- para quem já é membro da mesma fazenda.
create or replace function public.membros_da_fazenda(p_fazenda uuid)
returns table (user_id uuid, email text, nome text, papel text, entrou_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from fazenda_membros m where m.fazenda_id = p_fazenda and m.user_id = auth.uid()
  ) then
    raise exception 'Você não participa desta fazenda.';
  end if;

  return query
    select m.user_id, u.email::text, p.nome, m.papel, m.created_at
      from fazenda_membros m
      join auth.users u on u.id = m.user_id
      left join perfis p on p.user_id = m.user_id
     where m.fazenda_id = p_fazenda
     order by m.created_at;
end;
$$;

revoke all on function public.membros_da_fazenda(uuid) from public, anon;
grant execute on function public.membros_da_fazenda(uuid) to authenticated;
