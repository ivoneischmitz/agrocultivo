-- Exclusão de conta pelo próprio usuário.
--
-- Rode no SQL Editor, depois de supabase/fazendas.sql. Pode rodar de novo.
--
-- A Google exige que um app com cadastro ofereça, dentro do app, um caminho
-- para apagar a conta e os dados — e uma página na web com o mesmo pedido,
-- para quem não tem o app instalado. Esta função é o que faz o serviço.
--
-- ── A parte difícil: fazenda compartilhada ───────────────────────────────────
-- Os dados não são só de quem está saindo. Se o sócio continua usando a mesma
-- base, apagar tudo destruiria o trabalho dele. A regra é:
--
--   • fazenda em que a pessoa está sozinha  → apaga a fazenda e tudo dentro
--   • fazenda com outros membros            → a pessoa sai, e os dados ficam.
--     Se ela era a dona, o membro mais antigo vira dono, para a fazenda não
--     ficar sem ninguém que possa administrar.
--
-- Em qualquer caso, o perfil e a conta de acesso somem.

create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
  f record;
  sucessor uuid;
begin
  if eu is null then
    raise exception 'Sem sessão.';
  end if;

  for f in
    select m.fazenda_id, m.papel from fazenda_membros m where m.user_id = eu
  loop
    if (select count(*) from fazenda_membros x where x.fazenda_id = f.fazenda_id) = 1 then
      -- Sozinho: a fazenda inteira vai junto (a cascata leva cultivos,
      -- movimentações, itens, anexos, chuvas e fotos).
      delete from storage.objects
       where bucket_id in ('fotos-cultivo', 'anexos')
         and (storage.foldername(name))[1] = f.fazenda_id::text;

      delete from fazendas where id = f.fazenda_id;
    else
      if f.papel = 'dono' then
        select x.user_id into sucessor
          from fazenda_membros x
         where x.fazenda_id = f.fazenda_id and x.user_id <> eu
         order by x.created_at
         limit 1;

        update fazenda_membros set papel = 'dono'
         where fazenda_id = f.fazenda_id and user_id = sucessor;

        update fazendas set dono_id = sucessor where id = f.fazenda_id;
      end if;

      delete from fazenda_membros where fazenda_id = f.fazenda_id and user_id = eu;
    end if;
  end loop;

  delete from perfis where user_id = eu;
  delete from convites where criado_por = eu and usado_em is null;

  -- Por último a conta de acesso. A função roda com privilégio de
  -- administrador, que é o que permite mexer em auth.users.
  delete from auth.users where id = eu;
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- O que a pessoa perde, para a tela avisar antes de apagar: em quantas
-- fazendas ela está sozinha (essas somem) e em quantas há mais gente (dessas
-- ela só sai).
create or replace function public.resumo_exclusao()
returns table (fazendas_apagadas int, fazendas_que_ficam int, cultivos_apagados int)
language sql
stable
security definer
set search_path = public
as $$
  with minhas as (
    select m.fazenda_id,
           (select count(*) from fazenda_membros x where x.fazenda_id = m.fazenda_id) as membros
      from fazenda_membros m
     where m.user_id = auth.uid()
  )
  select
    coalesce(count(*) filter (where membros = 1), 0)::int,
    coalesce(count(*) filter (where membros > 1), 0)::int,
    coalesce((
      select count(*) from cultivos c
       where c.fazenda_id in (select fazenda_id from minhas where membros = 1)
         and c.deleted_at is null
    ), 0)::int
  from minhas;
$$;

revoke all on function public.resumo_exclusao() from public, anon;
grant execute on function public.resumo_exclusao() to authenticated;
