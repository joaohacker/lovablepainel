

## Plano: Upgrades de Limite via PIX para Tokens Existentes

### Resumo
Quando um cliente com token atingir o limite diario ou tentar gerar mais do que o limite por vez, em vez de ver uma mensagem de erro bloqueante, ele vera opcoes de upgrade com pagamento via PIX. Os limites comprados sao somados aos existentes.

### Precos
- **Limite diario**: R$ 15,00 por cada 1.000 creditos adicionais
- **Limite por vez (credits_per_use)**: R$ 30,00 por cada 1.000 creditos adicionais

### Fluxo do Usuario

**Cenario 1 - Limite por vez:**
O slider no CreditSelector continua limitado pelo `credits_per_use` atual. Abaixo do seletor, aparece um banner "Quer gerar mais por vez? Aumente seu limite" com opcoes de 1000, 2000, 3000+ creditos e o preco correspondente. Ao clicar, abre modal PIX. Apos pagamento confirmado, o token e atualizado e o slider reflete o novo limite.

**Cenario 2 - Limite diario atingido:**
Atualmente a pagina mostra "Acesso Negado - Limite diario atingido". Em vez disso, mostra uma tela com planos de aumento do limite diario (ex: +1000 por R$15, +2000 por R$30, +3000 por R$45). Apos pagar, o `daily_limit` do token e incrementado e o usuario pode gerar imediatamente.

### Etapas de Implementacao

**1. Backend - Nova Edge Function `upgrade-token`**
- Recebe: `token` (string), `upgrade_type` ("daily_limit" | "credits_per_use"), `increment` (multiplo de 1000)
- Calcula preco: increment/1000 * 15 (daily) ou increment/1000 * 30 (per_use)
- Cria PIX via BrPix API
- Salva order com `order_type: "upgrade_daily"` ou `"upgrade_per_use"`, e guarda o `token_id` e `increment` nos metadados
- Nao exige autenticacao (o token do cliente e suficiente)

**2. Backend - Atualizar `brpix-webhook`**
- Quando `order_type` e `"upgrade_daily"` ou `"upgrade_per_use"`:
  - Busca o token associado ao order
  - Incrementa `daily_limit` ou `credits_per_use` no registro do token
  - Marca order como pago

**3. Backend - Atualizar `validate-token`**
- Quando limite diario atingido, retornar `valid: true` com flag `daily_limit_reached: true` em vez de `valid: false`
- Incluir `remaining_daily` e `remaining_total` na resposta de validacao (ja faz parcialmente)

**4. Frontend - Novo componente `UpgradeModal`**
- Modal com opcoes de upgrade (1000, 2000, 3000, 5000 creditos)
- Mostra preco por opcao
- Gera QR Code PIX usando a nova edge function
- Poll no order para confirmar pagamento
- Apos confirmacao, revalida o token automaticamente

**5. Frontend - Atualizar `Generate.tsx`**
- Quando `daily_limit_reached: true`, mostrar UI de upgrade em vez de "Acesso Negado"
- Abaixo do CreditSelector, mostrar banner de upgrade do limite por vez

**6. Frontend - Atualizar `CreditSelector.tsx`**
- Adicionar prop `onUpgradePerUse` callback
- Mostrar link/banner abaixo do slider: "Limite atual: X creditos | Aumentar limite"

**7. Banco de Dados**
- Adicionar colunas `token_id` (uuid, nullable) e `upgrade_increment` (integer, nullable) na tabela `orders` para rastrear upgrades
- A coluna `token_id` ja existe na tabela orders

### Detalhes Tecnicos

**Nova coluna necessaria na tabela `orders`:**
```sql
ALTER TABLE orders ADD COLUMN upgrade_increment integer;
```

**Edge Function `upgrade-token` (nova):**
- Valida token no DB
- Calcula preco baseado no tipo e incremento
- Cria PIX via BrPix
- Insere order com: `order_type`, `token_id` (do token sendo upgradado), `upgrade_increment`, `amount`

**Webhook - novos tipos de order:**
```text
upgrade_daily  → tokens.daily_limit += upgrade_increment
upgrade_per_use → tokens.credits_per_use += upgrade_increment
```

**Config.toml:**
```toml
[functions.upgrade-token]
verify_jwt = false
```

