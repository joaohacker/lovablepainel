

## Planos de Licenca - Basico / Pro / Premium

### Resumo

Criar um sistema de planos de licenca com pagamento unico via PIX que libera um token automaticamente. Os planos aparecem em dois lugares: na landing page (abaixo do gerador por demanda) e em uma pagina dedicada `/planos`.

### Planos

| Plano    | Preco    | Limite Diario | Creditos/Geracao | Token Expira? |
|----------|----------|---------------|------------------|---------------|
| Basico   | R$ 49,00 | 500/dia       | 100/geracao      | Nao           |
| Pro      | R$ 99,00 | 1.500/dia     | 200/geracao      | Nao           |
| Premium  | R$ 199,00| 5.000/dia     | 500/geracao      | Nao           |

O pagamento e unico e o token nao expira. So tem os limites diarios configurados.

### O que sera construido

**1. Produtos no banco de dados**
- Inserir 3 produtos na tabela `products` com os nomes, precos e limites acima
- Cada produto tera `is_active = true` para aparecer na listagem publica

**2. Componente de cards de planos (`PlansSection`)**
- 3 cards lado a lado (empilhados no mobile)
- Cada card mostra: nome, preco, limite diario, creditos por geracao, botao "Assinar"
- O plano Pro tera destaque visual ("Mais Popular")
- Botao leva para `/checkout?product=<id>`

**3. Landing page - secao abaixo do gerador**
- Nova secao com titulo "Planos de Licenca" logo apos o gerador por demanda
- Usa o mesmo componente `PlansSection`
- Link na navbar: "Planos" aponta para `#planos` na landing ou para `/planos`

**4. Pagina dedicada `/planos`**
- Rota nova no App.tsx
- Reutiliza o componente `PlansSection` centralizado com navbar simplificada
- Mesmos cards e mesmo fluxo de checkout

**5. Navbar atualizada**
- Novo link "Planos" na navbar da landing page
- Aponta para a secao `#planos` quando na landing, ou `/planos` como link direto

**6. Fluxo de compra**
- O checkout atual (`/checkout?product=<id>`) ja funciona:
  - Gera PIX, aguarda pagamento, webhook cria o token automaticamente
  - Mostra link de acesso ao token na tela de sucesso
- Nenhuma alteracao necessaria no checkout ou nas edge functions existentes

### Detalhes Tecnicos

**Arquivos novos:**
- `src/components/public/PlansSection.tsx` - componente reutilizavel com os 3 cards
- `src/pages/Plans.tsx` - pagina dedicada `/planos`

**Arquivos modificados:**
- `src/App.tsx` - adicionar rota `/planos`
- `src/pages/Landing.tsx` - adicionar secao de planos abaixo do gerador + link na navbar

**Migracao SQL:**
- INSERT de 3 produtos na tabela `products` com os valores definidos

**Nenhuma alteracao em edge functions** - o fluxo de checkout e webhook existente ja lida com a criacao automatica do token apos pagamento.

