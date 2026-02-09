

# Painel Gerador de Créditos Lovable

## Visão Geral
Aplicação dark-mode com interface moderna para gerar créditos Lovable, conectada à API via proxy backend seguro (Lovable Cloud Edge Functions). Inclui painel administrativo com sistema de tokens para múltiplos clientes.

---

## 1. Backend - Edge Functions (Proxy Seguro)

### Edge Function: `farm-proxy`
- Proxy único que repassa todas as chamadas para `https://api.lovablextensao.shop`
- Armazena a API key como secret do Cloud (`FARM_API_KEY`)
- Endpoints expostos:
  - `POST /farm-proxy` com action: `create`, `cancel`, `status`, `stock`
- Para SSE (`/farm/events/:farmId`), a edge function faz streaming de volta ao frontend

### Edge Function: `validate-token`
- Valida tokens de acesso antes de permitir geração
- Verifica: ativo, expiração, limite total, limite diário
- Cria farm via API externa e registra uso no banco
- Insere registro na tabela `generations` para monitoramento ao vivo

---

## 2. Banco de Dados

### Tabelas
- `profiles`: Dados de usuário (auto-criado no signup)
- `user_roles`: Roles (admin, user) com `has_role()` security definer
- `tokens`: Tokens de acesso com client_name, total_limit, daily_limit, credits_per_use, expires_at
- `token_usages`: Log de cada uso de token
- `generations`: Registro de cada geração (realtime habilitado)

### Segurança
- RLS em todas as tabelas
- Admins gerenciam tokens e veem gerações via `has_role()`
- Clientes anônimos acessam via edge function com validação server-side

---

## 3. Rotas

### `/auth` - Login/Signup Admin
- Email + Senha
- Redireciona para `/admin` se já autenticado e admin

### `/admin` - Painel Administrativo
- **Tokens**: CRUD de tokens com link copiável
- **Ao Vivo**: Dashboard realtime com todas as gerações

### `/generate/:token` - Página do Cliente
- Valida token via edge function
- Mostra seletor de créditos (limitado por `credits_per_use`)
- Mostra informações de uso restante
- Fluxo de geração completo (fila, convite, execução, conclusão)

### `/` - Página Principal (original)
- Gerador direto sem token (mantido)

---

## 4. Fluxo de Geração (após clicar "Gerar")

### Estado: Na Fila (`queued`)
- Mensagem: "Posição X na fila, aguarde..."
- Polling automático a cada 5s até sair da fila

### Estado: Aguardando Convite (`waiting_invite`)
- **Email do bot master em destaque máximo** (texto grande, centralizado)
- Botão "Copiar Email" com feedback visual
- Instruções claras: "Convide este email no seu workspace Lovable"
- Timer regressivo de 10 minutos visível
- Botão "Cancelar" disponível

### Estado: Executando (`running`)
- Barra de progresso animada
- Contador de créditos incrementando em tempo real (+5 por claim)
- Nome do workspace detectado
- Log de progresso com mensagens do tipo info

### Estado: Concluído (`completed`)
- Tela de sucesso com animação
- "X créditos gerados com sucesso!" (usando `result.credits`)
- Estatísticas: tentados vs falhas
- Botão "Gerar Novamente"

### Estados de Erro
- **Expirado**: "Tempo esgotado" + botão tentar novamente
- **Erro**: Mensagem do erro + botão tentar novamente
- **Cancelado**: Confirmação de cancelamento

---

## 5. Comunicação em Tempo Real

- Conexão SSE para receber eventos de progresso
- Reconexão automática se a conexão cair
- Fallback para polling via `/farm/status` se SSE falhar
- Tratamento de todos os tipos de evento
- Supabase Realtime na tabela `generations` para dashboard admin

---

## 6. Regras de Segurança e UX

- Botão "Gerar" desabilitado após primeiro clique (evita duplicados)
- API key nunca exposta no frontend
- Validação client-side dos créditos (múltiplo de 5, range válido)
- Validação server-side via edge function (token, limites, expiração)
- Informações técnicas (farmId, proxy, logs internos) ocultas do usuário
- Sistema de roles com `has_role()` security definer para admin
