

# Painel de Gerenciamento de Links de Cliente

## Objetivo
Transformar a seção "Meus Links" em um painel completo onde o revendedor pode pesquisar, filtrar, ver detalhes, cancelar links e acompanhar em tempo real o que o cliente está fazendo.

## O que muda

### 1. Novo componente: ClientLinkManager
Substitui o atual `MyClientLinks` simples por um painel expandido com:

- **Barra de pesquisa** por token (parcial)
- **Filtros** por status: Todos / Ativo / Esgotado / Desativado
- **Lista expandida** com mais informações por link
- **Modal de detalhes** ao clicar em um link

### 2. Detalhes de cada link (modal/sheet)
Ao clicar num link, abre um painel lateral (Sheet) mostrando:

- Token (parcial, com botao copiar)
- Status (Ativo/Esgotado/Desativado)
- Creditos: usados / total / restantes
- Data de criacao
- **Historico de geracoes** vinculadas (da tabela `generations` via `client_token_id`):
  - Status de cada geracao (running, completed, waiting_invite, etc.)
  - Creditos solicitados vs entregues
  - Workspace detectado
  - Data/hora
- **Botao "Desativar Link"** (seta `is_active = false` via edge function)

### 3. Status em tempo real do cliente
Para geracoes com status ativo (`running`, `waiting_invite`, `queued`), mostra:
- Estado atual (ex: "Aguardando convite", "Gerando creditos...")
- Creditos ja gerados
- Workspace name (se detectado)

### 4. Edge Function: manage-client-token
Nova edge function que suporta:
- `action: "details"` -- retorna token + geracoes vinculadas
- `action: "deactivate"` -- desativa o link (verifica ownership)
- `action: "list"` -- lista com filtros e busca

## Detalhes Tecnicos

### Consulta de geracoes por client_token_id
A tabela `generations` ja tem a coluna `client_token_id`. A edge function usa service role para buscar:
```sql
SELECT status, credits_requested, credits_earned, workspace_name, 
       master_email, created_at, updated_at, farm_id
FROM generations 
WHERE client_token_id = '<token_uuid>'
ORDER BY created_at DESC
```

### Desativacao de link
Via edge function (service role), verifica que o `owner_id` do token pertence ao usuario autenticado, depois faz `UPDATE client_tokens SET is_active = false`.

### Componentes UI utilizados
- `Sheet` (painel lateral) para detalhes
- `Input` para busca
- `Badge` para status
- `Tabs` para filtros
- Icones do `lucide-react`

### Arquivos modificados/criados
1. **Novo**: `supabase/functions/manage-client-token/index.ts`
2. **Novo**: `src/components/public/ClientLinkManager.tsx` (substitui MyClientLinks)
3. **Editado**: `src/components/public/PublicGenerator.tsx` (troca MyClientLinks pelo novo componente)

