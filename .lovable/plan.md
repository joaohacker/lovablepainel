

# Painel Gerador de Créditos Lovable

## Visão Geral
Aplicação dark-mode com interface moderna para gerar créditos Lovable, conectada à API via proxy backend seguro (Lovable Cloud Edge Functions).

---

## 1. Backend - Edge Functions (Proxy Seguro)

### Edge Function: `farm-proxy`
- Proxy único que repassa todas as chamadas para `https://api.lovablextensao.shop`
- Armazena a API key como secret do Cloud (`FARM_API_KEY`)
- Endpoints expostos:
  - `POST /farm-proxy` com action: `create`, `cancel`, `status`, `stock`
- Para SSE (`/farm/events/:farmId`), a edge function faz streaming de volta ao frontend

---

## 2. Frontend - Tela Principal

### Seletor de Créditos
- Slider + input numérico (min 5, max 5005, step 5)
- Exibe quantidade de bots necessários (créditos ÷ 5)
- Indicador de estoque disponível (via `/farm/stock`)
- Botão "Gerar Créditos" em destaque azul

### Design
- Tema escuro com fundo dark
- Cards com bordas sutis e glassmorphism
- Verde para sucesso/créditos, azul para ações, vermelho para erros
- Totalmente responsivo (mobile-first)

---

## 3. Fluxo de Geração (após clicar "Gerar")

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

## 4. Comunicação em Tempo Real

- Conexão SSE para receber eventos de progresso
- Reconexão automática se a conexão cair
- Fallback para polling via `/farm/status` se SSE falhar
- Tratamento de todos os tipos de evento (snapshot, status, progress, completed, error, expired, cancelled, heartbeat)

---

## 5. Regras de Segurança e UX

- Botão "Gerar" desabilitado após primeiro clique (evita duplicados)
- API key nunca exposta no frontend
- Validação client-side dos créditos (múltiplo de 5, range válido)
- Informações técnicas (farmId, proxy, logs internos) ocultas do usuário

