# Agro Cultivo

Gestão de cultivos para o produtor rural: despesas e receitas por safra, pluviometria, fotos da lavoura, relatório em PDF, mapa satélite e painel de lucro. Roda em **Web, iOS e Android** a partir de uma única base de código.

Versão 2 do AppCultivo, reescrita no mesmo molde do Força de Vendas: [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/) + TypeScript, com os dados no [Supabase](https://supabase.com) (Postgres + Storage) em vez do SQLite do aparelho.

## Stack

- **React Native + Expo (SDK 57)**: um código só para Web, iOS e Android
- **Expo Router**: navegação por arquivos em `app/`
- **Supabase**: login por e-mail/senha, Postgres com RLS (cada conta vê só os seus dados) e Storage para fotos e anexos
- **Leaflet** (numa WebView ou num iframe): mapa satélite sem chave de API
- **Open-Meteo** e **IBGE**: clima, histórico de chuva e municípios, APIs gratuitas sem chave

## Rodando

```bash
npm install
cp .env.example .env   # preencha com os dados do projeto Supabase
npm run web            # abre no navegador
npm run android        # emulador ou Expo Go
npm run ios
```

Outros comandos: `npm run typecheck`, `npm run lint`, `npm run build:web` (gera `dist/`).

## Configurando o Supabase (uma vez)

Projeto: `efpghgwlvmrnnsmwhohy`.

> **Banco criado antes de setembro/2026** (chaves `bigint`): rode antes `supabase/migracao-uuid.sql`, uma vez, e depois o `schema.sql`. A migração converte as chaves em `uuid` e acrescenta `updated_at` e `deleted_at`, mantendo os dados.

1. **SQL Editor** → cole e rode `supabase/schema.sql`. Ele cria as tabelas, a RLS, a view de totais, a função que grava a movimentação com os itens e os buckets `fotos-cultivo` (público) e `anexos` (privado). Pode ser rodado de novo sem erro.
2. **Project Settings → API** → copie a *Project URL* e a *anon public key* para o `.env`.
3. **Authentication → URL Configuration** → em *Site URL* e *Redirect URLs*, coloque o endereço do app publicado (ex.: `https://agrocultivo.vercel.app` e `https://agrocultivo.vercel.app/nova-senha`). É para lá que o link de "Esqueci minha senha" volta.
4. Preencha `EXPO_PUBLIC_SITE_URL` no `.env` com esse mesmo endereço. É ele que o celular usa no link de recuperação.

## Trazendo os dados do app antigo

O AppCultivo 1.x guardava tudo no SQLite do celular e subia uma cópia em JSON para a tabela `backups` do projeto Supabase **antigo** (`xiqrzypbqtjgwgmvueqk`). O script `scripts/importar-backups.mjs` lê esses backups e grava tudo no projeto novo:

- recria cada conta pelo e-mail (os ids mudam de um projeto para outro);
- grava perfil, cultivos, despesas/receitas com os itens e registros de chuva;
- copia as fotos do bucket antigo para o novo.

```powershell
$env:ANTIGO_URL="https://xiqrzypbqtjgwgmvueqk.supabase.co"
$env:ANTIGO_SERVICE_KEY="<service_role do projeto antigo>"
$env:NOVO_URL="https://efpghgwlvmrnnsmwhohy.supabase.co"
$env:NOVO_SERVICE_KEY="<service_role do projeto novo>"
node scripts/importar-backups.mjs            # simulação: lista o que faria
node scripts/importar-backups.mjs --gravar   # grava
```

**Senhas:** sem mais nada, as contas nascem sem senha no projeto novo, e cada pessoa entra por "Esqueci minha senha" no primeiro acesso. Para manter as senhas, rode `select email, encrypted_password from auth.users;` no SQL Editor do projeto **antigo**, exporte o resultado como CSV e passe `--senhas arquivo.csv`. O script copia o hash (bcrypt) como está.

Pode rodar mais de uma vez: quem já tem cultivos no projeto novo é pulado.

**Não vem do app antigo:**
- anexos de movimentação, que eram só arquivos no celular e não iam para o backup;
- dados de quem nunca gerou backup. No 1.x o envio automático era só para usuários Pro.

As chaves `service_role` ignoram a RLS: use só no seu computador, nunca no app nem no git.

## Preparado para funcionar offline no celular

O plano é a web continuar só online e o aplicativo do celular guardar os dados no próprio aparelho, sincronizando quando houver rede — como o app antigo fazia, mas com sincronização nos dois sentidos. A parte do banco já está pronta:

- **`id` é `uuid` gerado por quem cria a linha**, não uma sequência do Postgres. Sem isso o aparelho não consegue criar uma despesa e amarrar os itens nela antes de ter rede.
- **`updated_at` em toda tabela**, mexido por gatilho: é assim que o aparelho pede "o que mudou desde a última vez" em vez de baixar tudo.
- **Exclusão marcada em `deleted_at`**, nunca apagada: linha que some do Postgres é invisível para um aparelho offline e voltaria na próxima subida.

Falta a camada local no celular (SQLite + fila de envio), seguindo o mesmo padrão de arquivo por plataforma que o mapa já usa (`MapaLeaflet.tsx` / `MapaLeaflet.web.tsx`).

Clima, chuva por satélite, municípios e mapa dependem de rede em qualquer cenário.

## Publicando na web (Vercel)

O `vercel.json` já traz o build (`npm run build:web`), a pasta `dist` e o rewrite para a página única. Em **Project Settings → Environment Variables** da Vercel, cadastre `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` e `EXPO_PUBLIC_SITE_URL`. Sem elas o build passa, mas o site abre em branco.

## Celular (EAS)

`app.json` mantém o `package`/`bundleIdentifier` (`com.agronegocio.appcultivo`) e o `projectId` do EAS do app antigo, então o build novo atualiza o mesmo app instalado.

```bash
eas build --profile preview --platform android      # APK para testar
eas build --profile production --platform android
```

As variáveis `EXPO_PUBLIC_*` precisam existir no ambiente do EAS (`eas env:create`) ou num `.env` presente no momento do build.

## O que mudou em relação ao 1.x

| 1.x | 2.0 |
|---|---|
| SQLite no aparelho, backup em JSON | Tabelas no Postgres, dados iguais em todo aparelho |
| Só Android/iOS | Web também |
| React Navigation, JavaScript | Expo Router, TypeScript |
| Plano Pro (RevenueCat) com limites | Tudo liberado |
| `react-native-maps` (exigia chave Google no Android) | Leaflet + satélite Esri, sem chave |
| `react-native-chart-kit` | Barras desenhadas com `View` |
| DateTimePicker nativo | Calendário próprio (`components/DateField.tsx`) |
| Anexos só no celular | Anexos no Storage (bucket privado, link temporário) |
| Tela de fotos sem acesso pelo app | Botão "📸 Fotos" no cartão do cultivo |
| Talhões (tabela órfã) | Removido |
