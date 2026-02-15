

# Painel Gerador Publico On-Demand

## Resumo

Criar um painel gerador publico acessivel na landing page onde qualquer visitante pode gerar creditos pagando por demanda. O sistema mostra saldo em R$ e creditos simultaneamente, e exibe geracoes de outros clientes em uma aba lateral.

---

## Tabela de Precos

| Faixa de Creditos | Preco por 100 creditos |
|---|---|
| Ate 999 | R$ 7,00 |
| 1.000 - 1.999 | R$ 6,50 |
| 2.000 - 2.999 | R$ 6,00 |
| 3.000 - 5.000 | R$ 5,50 |

Pacotes fixos pre-definidos tambem serao exibidos para facilitar a compra rapida.

---

## Fluxo do Usuario

```text
+---------------------+
| Landing Page        |
| (Painel Publico)    |
+---------------------+
         |
   Seleciona creditos
   (slider 5-5000)
         |
   Clica "Gerar"
         |
    Tem saldo? ---------> SIM: Inicia geracao
         |                       (email master, polling, etc.)
        NAO
         |
   Modal "Sem Saldo"
   "Adicione saldo"
         |
   PIX gerado (valor exato
   ou saldo livre)
         |
   Pagamento confirmado
         |
   Ja tem conta? -------> SIM: Saldo creditado
         |                       Geracao inicia automaticamente
        NAO
         |
   Formulario criar conta
   (email + senha)
         |
   Conta criada + saldo
   creditado + geracao inicia
```

---

## O que sera construido

### 1. Banco de Dados (novas tabelas e alteracoes)

**Tabela `wallets`** -- saldo do usuario
- `id` (uuid, PK)
- `user_id` (uuid, referencia auth.users)
- `balance` (numeric, default 0) -- saldo em reais
- `created_at`, `updated_at`
- RLS: usuario ve/atualiza apenas proprio saldo

**Tabela `wallet_transactions`** -- historico de depositos/gastos
- `id` (uuid, PK)
- `wallet_id` (uuid, FK wallets)
- `type` (text: 'deposit' | 'debit')
- `amount` (numeric) -- valor em R$
- `credits` (integer, nullable) -- creditos associados (para debitos)
- `description` (text)
- `reference_id` (text, nullable) -- farm_id ou order_id
- `created_at`
- RLS: usuario ve apenas proprias transacoes

**Alteracao na tabela `generations`**
- Adicionar coluna `user_id` (uuid, nullable) para vincular geracoes ao usuario do painel publico
- Geracoes com token continuam usando `token_id`, geracoes on-demand usam `user_id`

**Alteracao na tabela `orders`**
- Adicionar coluna `user_id` (uuid, nullable) para vincular depositos de saldo

### 2. Edge Function `public-generate`

Nova edge function que:
- Recebe `user_id` e `credits` desejados
- Calcula o custo baseado na tabela de precos
- Verifica saldo na wallet
- Se suficiente: debita saldo, cria farm via API externa, insere em `generations`
- Se insuficiente: retorna erro com valor necessario

### 3. Edge Function `wallet-deposit`

Nova edge function para depositos de saldo:
- Cria cobranca PIX via BrPix (similar ao brpix-payment existente)
- Ao confirmar pagamento (webhook), credita saldo na wallet

### 4. Alteracao no `brpix-webhook`

Adicionar logica para processar depositos de saldo (alem dos tokens existentes):
- Se o pedido tem `user_id` e tipo "deposit", credita na wallet
- Se tinha geracao pendente, inicia automaticamente

### 5. Frontend -- Novo componente `PublicGenerator`

Componente principal na landing page com:
- **Seletor de creditos** (slider 5-5000, multiplos de 5)
- **Calculadora de preco** em tempo real (mostra R$ e creditos)
- **Pacotes fixos** (ex: 100, 500, 1000, 2000, 5000 creditos)
- **Display de saldo** (R$ X,XX = Y creditos)
- **Botao "Gerar"** que verifica saldo
- **Modal sem saldo** com opcao de pagamento PIX rapido
- **Status da geracao** (reutiliza GenerationStatus existente)

### 6. Frontend -- Aba "Geracoes ao Vivo"

Pequena aba/tab no painel publico mostrando:
- Lista de geracoes ativas de outros usuarios (anonimizadas)
- A geracao do usuario atual em destaque/principal
- Dados: quantidade de creditos, status, progresso
- Atualizado via polling a cada 5s

### 7. Frontend -- Fluxo de Autenticacao Inline

- Se usuario nao logado tenta gerar: modal de login/cadastro aparece
- Apos pagamento confirmado sem conta: formulario de criacao de conta
- Conta criada -> saldo vinculado -> geracao inicia

### 8. Landing Page -- Integracao

- Substituir a secao de "Pricing Card" atual por uma secao interativa com o PublicGenerator
- Manter secoes de beneficios e como funciona
- O painel publico sera a peca central da pagina

---

## Detalhes Tecnicos

### Calculo de Preco (funcao utilitaria)

```text
function calcularPreco(creditos: number): number {
  precoPor100 =
    creditos >= 3000 ? 5.50
    creditos >= 2000 ? 6.00
    creditos >= 1000 ? 6.50
    default: 7.00

  return (creditos / 100) * precoPor100
}
```

### Pacotes Fixos Sugeridos

| Pacote | Creditos | Preco | Economia |
|---|---|---|---|
| Starter | 100 | R$ 7,00 | -- |
| Popular | 500 | R$ 35,00 | -- |
| Pro | 1.000 | R$ 65,00 | 7% off |
| Business | 2.000 | R$ 120,00 | 14% off |
| Enterprise | 5.000 | R$ 275,00 | 21% off |

### Seguranca

- Todas as operacoes de saldo passam por edge functions com service role
- RLS garante que usuarios so veem proprio saldo e transacoes
- Debito de saldo e atomico (verifica + debita na mesma transacao)
- Geracoes publicas ficam visiveis para todos (sem dados sensiveis)

### Arquivos a Criar/Editar

**Novos:**
- `src/components/public/PublicGenerator.tsx` -- componente principal
- `src/components/public/CreditCalculator.tsx` -- calculadora de preco
- `src/components/public/LiveGenerations.tsx` -- aba de geracoes ao vivo
- `src/components/public/WalletDisplay.tsx` -- display de saldo
- `src/components/public/DepositModal.tsx` -- modal de deposito PIX
- `src/components/public/AuthModal.tsx` -- modal login/cadastro inline
- `src/hooks/useWallet.ts` -- hook para gerenciar saldo
- `src/hooks/usePublicGeneration.ts` -- hook para geracao publica
- `src/lib/pricing.ts` -- funcoes de calculo de preco
- `supabase/functions/public-generate/index.ts` -- edge function geracao
- `supabase/functions/wallet-deposit/index.ts` -- edge function deposito

**Editados:**
- `src/pages/Landing.tsx` -- integrar PublicGenerator
- `supabase/functions/brpix-webhook/index.ts` -- suportar depositos
- Migracoes SQL para novas tabelas e colunas

