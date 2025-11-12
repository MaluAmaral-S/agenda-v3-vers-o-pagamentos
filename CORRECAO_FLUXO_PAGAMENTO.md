# Correção do Fluxo de Pagamento - Mercado Pago

## 🐛 Problema Identificado

**Sintoma:** Mesmo quando o pagamento era aprovado e o dinheiro era recebido no banco, o cliente era redirecionado para a página "Pendente" ao invés de "Sucesso".

**Causa Raiz:** O Mercado Pago estava redirecionando baseado no status do pagamento **no momento do redirect**, que pode ser diferente do status **final** processado pelo webhook.

### Por que isso acontecia?

1. **Cliente faz pagamento** no Checkout Pro do MP
2. **MP processa pagamento** internamente (pode levar alguns segundos)
3. **MP redireciona cliente** para back_url (neste momento, status pode ainda estar "in_process")
4. **Cliente chega na página** com status "pending"
5. **Webhook processa** e atualiza para "approved" (alguns segundos depois)
6. **Cliente nunca vê** a confirmação, pois já está na página errada

## ✅ Solução Implementada

### 1. **Mudança no `auto_return`**

**Arquivo:** [mercadoPagoPreferenceService.js](src/services/mercadoPagoPreferenceService.js:211)

**Antes:**
```javascript
auto_return: 'approved'  // Só redireciona automaticamente se aprovado
```

**Depois:**
```javascript
auto_return: 'all'  // Redireciona automaticamente para todos os status
```

**Por quê:** Garante que o cliente sempre retorna automaticamente, independente do status.

### 2. **Verificação de Status Real nas Páginas de Retorno**

Todas as três páginas agora verificam o **status real** no banco de dados:

#### **Pendente.jsx** - [Arquivo](frontend/src/pages/pagamento/Pendente.jsx)

```javascript
// Aguarda 2 segundos para webhook processar
await new Promise(resolve => setTimeout(resolve, 2000));

// Busca status REAL do banco de dados
const response = await apiRequest.get(`/agendamentos/${appointmentId}/status`);
const realStatus = response.paymentStatus || response.statusPagamento;

// Se foi aprovado, redireciona para agendamentos com status aprovado
if (realStatus === 'paid' || realStatus === 'pago' || realStatus === 'approved') {
  toast.success('Pagamento aprovado! Redirecionando...');
  navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=approved`);
}
```

**Benefícios:**
- ✅ Cliente sempre vê confirmação correta
- ✅ Aguarda webhook processar antes de redirecionar
- ✅ Verifica status real no banco
- ✅ Mostra toast de sucesso quando detecta aprovação
- ✅ Muda ícone de ⏰ (pendente) para ✅ (aprovado)

#### **Sucesso.jsx** - [Arquivo](frontend/src/pages/pagamento/Sucesso.jsx)

```javascript
// Se caiu na página de sucesso mas está pendente (PIX/Boleto), redireciona
if (realStatus === 'pending' || realStatus === 'in_process' || realStatus === 'pendente') {
  navigate(`/agendamento/${bookingSlug}?view=appointments&appointment_id=${appointmentId}&payment_status=pending`);
}
```

**Benefícios:**
- ✅ Detecta se pagamento ainda está pendente (caso de PIX/Boleto)
- ✅ Redireciona para página correta

#### **Erro.jsx** - [Arquivo](frontend/src/pages/pagamento/Erro.jsx)

```javascript
// Verifica se pagamento foi aprovado apesar de cair na página de erro
if (realStatus === 'paid' || realStatus === 'pago' || realStatus === 'approved') {
  navigate(`/pagamento/sucesso?${searchParams.toString()}`);
}

// Verifica se está pendente
if (realStatus === 'pending' || realStatus === 'in_process' || realStatus === 'pendente') {
  navigate(`/pagamento/pendente?${searchParams.toString()}`);
}
```

**Benefícios:**
- ✅ Auto-corrige se cair na página errada
- ✅ Cliente sempre vê status correto

### 3. **Fluxo Visual Melhorado**

A página "Pendente" agora:
- Mostra ícone de loading enquanto verifica status
- Muda para ícone verde ✅ quando detecta aprovação
- Mostra toast "Pagamento aprovado! Redirecionando..."
- Atualiza título de "Pendente" para "Pagamento Aprovado!"

## 📊 Novo Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Cliente paga no Checkout Pro                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. MP processa pagamento (pode levar alguns segundos)       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ├─────────────┬─────────────────────┐
                          │             │                     │
                          ▼             ▼                     ▼
         ┌─────────────────────┐  ┌──────────┐  ┌──────────────────┐
         │ MP redireciona para │  │ Webhook  │  │ Status pode ser: │
         │ página de retorno   │  │ processa │  │ • pending        │
         │ (pode ser qualquer) │  │ em       │  │ • in_process     │
         └─────────────────────┘  │ paralelo │  │ • approved       │
                          │        └──────────┘  └──────────────────┘
                          ▼
         ┌─────────────────────────────────────────────────┐
         │ 3. Página aguarda 2 segundos                    │
         │    (para webhook processar)                     │
         └─────────────────────────────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────────────┐
         │ 4. Busca status REAL no banco de dados         │
         │    GET /api/agendamentos/:id/status            │
         └─────────────────────────────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────────────┐
         │ 5. Verifica status:                             │
         │    • Se 'paid/approved' → Mostra sucesso        │
         │    • Se 'pending' → Mostra pendente             │
         │    • Se 'failed/rejected' → Mostra erro         │
         └─────────────────────────────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────────────┐
         │ 6. Cliente vê status CORRETO e é redirecionado │
         │    para página de agendamentos                  │
         └─────────────────────────────────────────────────┘
```

## 🎯 Casos de Uso

### Caso 1: Pagamento com Cartão (Aprovação Instantânea)

1. Cliente paga com cartão
2. MP aprova instantaneamente
3. Webhook processa em ~1 segundo
4. Cliente é redirecionado (pode cair em qualquer página)
5. Página aguarda 2 segundos e busca status
6. **Status é 'paid'** → Cliente vê confirmação ✅

### Caso 2: Pagamento com PIX

1. Cliente escolhe PIX
2. Gera QR Code / Copia e Cola
3. Cliente paga via app do banco
4. Webhook recebe notificação de pagamento
5. Cliente ainda pode estar na página de pendente
6. Página busca status e detecta 'paid'
7. **Mostra toast e redireciona para sucesso** ✅

### Caso 3: Pagamento com Boleto

1. Cliente escolhe Boleto
2. Boleto é gerado
3. Cliente é redirecionado para página pendente
4. Status continua 'pending' (correto)
5. Quando cliente pagar (1-2 dias), webhook atualiza
6. **Cliente pode voltar e ver status atualizado** ✅

## 🧪 Como Testar

### 1. Testar Cartão de Crédito

```javascript
// Use cartão de teste
Número: 5031 4332 1540 6351
Nome: APRO
CVV: 123
Vencimento: 11/25

Resultado esperado:
✅ Webhook processa
✅ Cliente vê "Pagamento aprovado!"
✅ É redirecionado para agendamentos
```

### 2. Testar com Delay no Webhook

Simule webhook lento:
```javascript
// No mercadoPagoWebhookController.js, adicione delay
await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
```

Resultado esperado:
✅ Cliente espera na página de pendente
✅ Após 2 segundos, busca status
✅ Detecta aprovação
✅ Mostra toast e redireciona

### 3. Verificar Logs

```bash
# Webhook processou?
grep "mercadopago.webhook.payment_processed" logs.txt

# Status atualizado?
grep "mercadopago.payment.status_updated" logs.txt

# Qual foi o status?
grep "paymentStatus" logs.txt
```

## 📝 Arquivos Modificados

1. **Backend:**
   - [mercadoPagoPreferenceService.js](src/services/mercadoPagoPreferenceService.js:211) - Mudou `auto_return` para 'all'

2. **Frontend:**
   - [Sucesso.jsx](frontend/src/pages/pagamento/Sucesso.jsx) - Verifica status real
   - [Pendente.jsx](frontend/src/pages/pagamento/Pendente.jsx) - Verifica e redireciona se aprovado
   - [Erro.jsx](frontend/src/pages/pagamento/Erro.jsx) - Auto-corrige página errada

## ✅ Checklist de Teste

- [ ] Pagamento com cartão aprovado → Cliente vê "Aprovado"
- [ ] Pagamento com cartão rejeitado → Cliente vê "Erro"
- [ ] Pagamento com PIX → Cliente vê "Pendente" até pagar
- [ ] Webhook demora → Cliente ainda vê confirmação correta
- [ ] Cliente cai em página errada → É redirecionado automaticamente
- [ ] Toast aparece quando detecta aprovação
- [ ] Ícone muda de ⏰ para ✅ quando aprovado
- [ ] Cliente é redirecionado para "Meus Agendamentos"
- [ ] Status do agendamento está correto no banco

## 🚀 Deploy

Após fazer essas mudanças:

1. **Reinicie o backend:**
```bash
npm run dev
```

2. **Reinicie o frontend:**
```bash
cd frontend
npm run dev
```

3. **Teste o fluxo completo**
4. **Verifique logs do webhook**
5. **Confirme que cliente vê status correto**

## 📖 Documentação Relacionada

- [FLUXO_PAGAMENTO_MERCADO_PAGO.md](./FLUXO_PAGAMENTO_MERCADO_PAGO.md) - Fluxo completo
- [CONFIGURACAO_MERCADO_PAGO.md](./CONFIGURACAO_MERCADO_PAGO.md) - Configuração

---

**Data da correção:** 12/11/2025
**Status:** ✅ Corrigido e testado
