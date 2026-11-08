# Guia de Publicação — GitHub (`hipecreator20/rodovarconecta2027`) + Vercel + Neon

O projeto já está configurado com:
- **Frontend SPA (Vite + React)** compilando em `dist/` (`npm run build`).
- **Backend Serverless Vercel (`api/index.ts` + `vercel.json`)** roteando todas as chamadas `/api/*` para a aplicação Express (`createExpressApp` em `server.ts`).
- **Armazenamento Híbrido Serverless (`src/server/dataRoot.ts` + `neon.ts`)**: inclui automaticamente a pasta `data/**` na função serverless (`includeFiles: "data/**"`) com cópia automática para `/tmp/rodovar-conecta-runtime` na Vercel e sincronização com o banco **Neon PostgreSQL** (`ep-raspy-river-b6yady4i-pooler.c-2.sa-east-1.aws.neon.tech/neondb`).

## Passo 1 — Sincronizar do Google AI Studio para o GitHub

1. No canto superior direito do **Google AI Studio**, clique no ícone do **GitHub (Save to GitHub)**.
2. Autorize sua conta GitHub (`hipecreator20`) caso solicitado.
3. Selecione o repositório **`hipecreator20/rodovarconecta2027`** e a branch **`main`**, e clique em **Save / Push**.
   *(Alternativamente, você pode fazer download do ZIP pelo menu do AI Studio e enviar os arquivos para `https://github.com/hipecreator20/rodovarconecta2027`).*

## Passo 2 — Importar na Vercel e Conectar o Neon

1. Acesse o painel da **Vercel** (`https://vercel.com/new`) e importe o repositório **`hipecreator20/rodovarconecta2027`**.
2. Mantenha as configurações detectadas automaticamente pelo `vercel.json`:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Em **Environment Variables** na Vercel (ou pela integração **Neon for Vercel** aberta na sua aba), adicione:
   - `DATABASE_URL`: sua string de conexão do Neon (`postgresql://neondb_owner:SUA_SENHA@ep-raspy-river-b6yady4i-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`)
   - `NEON_AUTH_URL`: `https://ep-raspy-river-b6yady4i.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth`
   - `NEON_JWKS_URL`: `https://ep-raspy-river-b6yady4i.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json`
4. Clique em **Deploy**.

## Passo 3 — Autorizar o Domínio da Vercel no Neon Auth

1. Após a Vercel gerar a URL do projeto (ex.: `https://rodovarconecta2027.vercel.app`), volte na aba **Console Neon → Configurações → Melhor Autenticação → Domínios**.
2. No campo **Adicionar novo domínio**, cole a URL da Vercel (`https://rodovarconecta2027.vercel.app`) e clique em **Adicionar domínio**.

