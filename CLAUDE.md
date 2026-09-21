# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agro Cultivo 2.0: an Expo (React Native) app for farm crop management (cultivos, despesas/receitas, pluviometria, fotos, relatório, mapa, painel de lucro) that runs on **Web, iOS and Android from one codebase**. It is a rewrite of `C:\Utilitarios\AppCultivo` (1.x: JS, React Navigation, SQLite on-device + JSON backup) following the architecture of the Força de Vendas project (`C:\Utilitarios\Forca de Vendas`): Expo Router + TypeScript + Supabase as the real data store. See `README.md` for setup, Supabase config and the data import from 1.x. UI text and code identifiers are Portuguese.

@AGENTS.md

## Commands

```
npm start / npm run web / npm run android / npm run ios
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npm run build:web        # expo export -p web -> dist/ (good bundling smoke test)
node scripts/importar-backups.mjs [--gravar] [--senhas x.csv]   # one-off import from the 1.x Supabase project
```

No test runner. Port 8081 is often taken by another Expo project on this machine; `.claude/launch.json` uses 8095.

## Architecture

**Routing (Expo Router, `app/`)** — same per-route-group auth pattern as Força de Vendas: the root `_layout.tsx` only wires providers; `login.tsx` redirects away when signed in; `(app)/_layout.tsx` redirects to `/login` without a session (and to `/nova-senha` during a password-recovery session) and renders a top `Tabs` bar (Início, Cultivos, Lucro, Mapa, Perfil). Don't add a global redirect guard.

`(app)/cultivos/` is a nested `Stack` (`popToTopOnBlur` on the tab). Every per-cultivo screen lives under `cultivos/[id]/…` and loads its cultivo from the URL id via `lib/useCultivo.ts` — never pass objects or callbacks through route params (1.x did; it breaks on web refresh). Extra inputs go in the query string (`movimentacao?tipo=DESPESA&mov=12`, and `desc/qtd/cat` for the Calculadora → nova despesa prefill). The 1.x `SeletorMapa` callback-route became `components/SeletorMapaModal.tsx` for this reason.

**Data access** — thin async function files in `lib/` per table (`cultivos.ts`, `movimentacoes.ts`, `pluviometria.ts`, `fotos.ts`, `anexos.ts`, `perfil.ts`); screens own loading/error state and refresh with `useRecarregarAoFocar`. No cache/query library. PostgREST returns `numeric` as strings — the lib functions convert to `number`; keep doing that at the lib boundary.

**Access model is per-farm** (`supabase/fazendas.sql`). Every data table has `fazenda_id`; the RLS policy is `fazenda_id in (select public.minhas_fazendas())`, where that SECURITY DEFINER function reads `fazenda_membros` (definer to avoid the policy recursing into itself). `user_id` stays on each row but now means "who entered it". Signup is open; a new account gets its first fazenda from `garantir_fazenda()`, called by `contexts/FazendaContext.tsx`.
- Only `cultivos` receives `fazenda_id` from the app (from `useFazenda()`); movimentações, itens, anexos, chuvas and fotos inherit it from the parent via the `herdar_fazenda()` trigger. Keep that pattern for new child tables.
- Any member can invite (`convites`: single-use token, 7-day expiry, cancellable); only the `dono` can remove members. Joining happens exclusively through the `aceitar_convite()` RPC — there is deliberately no insert policy on `fazenda_membros`.
- Storage: new files go to `{fazenda_id}/…`; policies also accept legacy `{user_id}/…` paths when a row of the caller's fazenda points at them, so nothing had to be moved.
- Reads still filter `fazenda_id` in `lib/` for people who belong to more than one farm — RLS alone would merge them.

**Offline-ready schema decisions**: PKs are `uuid` (client-generated, not a Postgres sequence), every table carries `updated_at` (set by trigger, never by the app) and deletes are soft (`deleted_at`, propagated to children by trigger). This exists so the native app can later own a local SQLite copy and sync deltas; keep new tables to the same three rules. Lib functions filter `deleted_at is null` on reads and `update({ deleted_at })` on delete. `supabase/migracao-uuid.sql` is the one-off conversion for the database that predates this.

**Schema (`supabase/schema.sql`)** — `perfis` (1 row per user), `cultivos`, `movimentacoes` (header: tipo DESPESA|RECEITA, descricao, data, categoria), `movimentacao_itens` (the money: `quantidade × valor`), `movimentacao_anexos` (storage path in private bucket `anexos`, opened via signed URL), `pluviometria`, `fotos_cultivo` (public bucket `fotos-cultivo`). `cultivos.area_hectares` was `quantidade_alqueire` in 1.x but always held hectares; 1 alqueire = 2.42 ha (`HA_POR_ALQUEIRE`).
- View `cultivos_resumo` (`security_invoker`) returns each cultivo with `total_despesas/total_receitas/total_chuva` — use it for lists instead of per-card queries.
- RPC `salvar_movimentacao(...)` writes header + replaces all itens in one transaction (security invoker). Anexos are uploaded *after* it returns, so an upload failure never loses the lançamento.
- Schema changes: edit `schema.sql` idempotently (if not exists / or replace) — it's meant to be re-runnable.

**`cultivos/[id]/calculadora` has no entry point on purpose** — its button was removed from the cultivo card, and the owner wants the screen kept for later work. Don't delete it as dead code. It answers "how much seed to buy for this area"; the newer `/regulagem` screen (reachable from Início) answers "how to set up the machine", so they are not duplicates.

**Cross-platform choices (keep dependency-light, like Força de Vendas)**
- No `Alert.alert` with buttons (doesn't render on web): errors/success are inline `Mensagem`; irreversible actions use `BotaoConfirmar` (tap twice).
- Maps: `lib/mapaHtml.ts` builds a Leaflet page; `components/MapaLeaflet.tsx` (WebView) and `MapaLeaflet.web.tsx` (srcdoc iframe) host it. The page reloads only when the `marcadores` array identity changes — memoize it.
- Charts are plain `View` bars (`BarraHorizontal` in `components/ui.tsx`, column bars in `chuvas.tsx`).
- Dates: `components/DateField.tsx` (hand-built calendar, DD/MM/AAAA strings) + `lib/data.ts`; stored as ISO `date`.
- Files: `lib/arquivos.ts` reads picker URIs (web `fetch`, native `new File(uri)` from the SDK 57 `expo-file-system` API).
- Print/PDF: `lib/imprimir.ts` / `lib/compartilhar.ts` (copied from Força de Vendas; web prints via hidden iframe).
- Numbers typed by users: `parseNumeroLivre` (`lib/formatar.ts`) accepts `12.5` or `12,5`; `lib/numero.ts`'s `parseDecimal` is strict BR format and reads `12.50` as 1250.

Shared UI primitives live in `components/ui.tsx`; colors in `lib/tema.ts` (light theme, green primary — matches the light components inherited from Força de Vendas).

**Password recovery** — `resetPasswordForEmail` redirects to `/nova-senha` on the web origin (or `EXPO_PUBLIC_SITE_URL` from native). `lib/supabase.ts` sets `detectSessionInUrl` on web only; `AuthContext` flags `isRecovery` on the `PASSWORD_RECOVERY` event. This is also the first-login path for users imported from 1.x without a password hash.

**Removed from 1.x on purpose**: RevenueCat/Pro gating and Paywall (everything free), SQLite + sync/backup services, talhões, `react-native-maps`, `react-native-chart-kit`, datetimepicker.
