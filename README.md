# Marketing Studio

Plataforma unificada de marketing para e-commerces. Gere campanhas de e-mail, crie artes para Instagram e agende stories — tudo em um só lugar, com IA.

---

## Módulos

### E-mail
- Importa feed XML de produtos (Google Shopping)
- IA seleciona produtos e define estratégia (single ou coleção temática)
- Gera subject + corpo do e-mail em PT-BR pronto para o Listmonk
- Histórico de envios para evitar repetição de produtos (janela de 15 dias)

### Arte
- Upload da foto da peça ou seleção direto do feed
- Descreva o cenário/contexto livremente
- IA planeja a composição (Gemini) e gera a arte (FLUX) em Story (9:16) ou Post (1:1)
- Vincula a arte gerada diretamente a uma coleção da Agenda

### Agenda
- Cadastro de coleções com artes e prioridades (Alta / Média / Baixa)
- Configuração de horários de postagem com slots "nobres"
- Geração de grade para qualquer período
- Legenda e CTAs gerados por IA para cada arte
- Cooldown de 72h por arte para evitar repetição
- Confirmar grade atualiza o histórico de uso automaticamente

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Backend | Express + TypeScript |
| Banco de dados | PostgreSQL 16 |
| Auth | JWT — bcryptjs + jsonwebtoken (30 dias) |
| IA (texto/planejamento) | OpenRouter → `google/gemini-2.5-flash` |
| IA (imagens) | OpenRouter → `black-forest-labs/flux.2-pro` |
| Infraestrutura | Docker + Docker Compose |

---

## Configuração (.env)

```env
OPENROUTER_API_KEY="sk-or-..."
DEFAULT_USER_EMAIL="admin@example.com"
DEFAULT_USER_PASSWORD="suasenha"
JWT_SECRET="string-aleatoria-longa"

# opcional — padrão: postgresql://studio:studio_pass@localhost:5432/marketing_studio
DATABASE_URL="postgresql://..."
```

> Na primeira inicialização com banco vazio, o sistema cria automaticamente o usuário definido em `DEFAULT_USER_EMAIL` / `DEFAULT_USER_PASSWORD`. Não há tela de cadastro — acesso restrito.

---

## Rodando com Docker

```bash
docker compose up --build
# App em http://localhost:3000
```

Dados persistem em volumes Docker (`postgres_data` e `uploads`).

---

## Rodando em Desenvolvimento

```bash
npm install
npm run dev
# App em http://localhost:3001
```

PostgreSQL local esperado em `localhost:5432`. As tabelas são criadas automaticamente na primeira execução.

---

## Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `OPENROUTER_API_KEY` | Chave da API OpenRouter | Sim |
| `DEFAULT_USER_EMAIL` | E-mail do usuário inicial | Sim (primeiro start) |
| `DEFAULT_USER_PASSWORD` | Senha do usuário inicial | Sim (primeiro start) |
| `JWT_SECRET` | Secret para assinar tokens JWT | Sim |
| `DATABASE_URL` | Connection string do PostgreSQL | Não (tem padrão) |
| `NODE_ENV` | `development` ou `production` | Não |

---

## Estrutura do Projeto

```
marketing-studio/
├── src/
│   ├── App.tsx                     # Layout principal + auth
│   ├── types.ts                    # Tipos TypeScript unificados
│   ├── api.ts                      # Cliente HTTP (JWT em todas as chamadas)
│   └── modules/
│       ├── auth/
│       │   └── LoginPage.tsx       # Tela de login
│       ├── email/
│       │   └── EmailModule.tsx     # Módulo de e-mail marketing
│       ├── arte/
│       │   ├── ArteModule.tsx      # Gerador de artes (Gemini → FLUX)
│       │   ├── ImageUploader.tsx   # Upload com drag-and-drop
│       │   └── ThinkingLog.tsx     # Log do raciocínio da IA
│       └── agenda/
│           ├── AgendaModule.tsx    # Wrapper + sync com PostgreSQL
│           ├── CollectionManager.tsx
│           ├── ScheduleView.tsx
│           └── ScheduleConfig.tsx
├── services/
│   └── scheduler.ts                # Algoritmo de agendamento (cooldown, prioridades)
├── server.ts                       # Express + PostgreSQL + auth + upload
├── Dockerfile
├── docker-compose.yml
└── .env
```

---

## API

Todas as rotas abaixo exigem `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login — retorna JWT |
| GET | `/api/log` | Lista histórico de e-mails |
| POST | `/api/log` | Registra e-mail enviado |
| DELETE | `/api/log/:id` | Remove registro |
| GET | `/api/settings/:key` | Lê configuração |
| POST | `/api/settings` | Salva configuração |
| GET | `/api/proxy-feed?url=` | Proxy CORS para feed XML / imagens |
| GET | `/api/collections` | Lista coleções com artes |
| POST | `/api/collections` | Cria coleção |
| PUT | `/api/collections/:id` | Atualiza coleção |
| DELETE | `/api/collections/:id` | Remove coleção |
| POST | `/api/collections/:id/arts` | Adiciona arte à coleção |
| PUT | `/api/arts/:id` | Atualiza arte |
| DELETE | `/api/arts/:id` | Remove arte (e arquivo do disco) |
| GET | `/api/schedule-slots` | Lista horários |
| POST | `/api/schedule-slots` | Adiciona horário |
| DELETE | `/api/schedule-slots/:id` | Remove horário |
| POST | `/api/upload` | Upload de imagens (multipart) |
| POST | `/api/upload-url` | Salva imagem a partir de URL ou base64 |
