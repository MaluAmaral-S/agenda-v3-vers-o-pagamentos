# Fluxo de Pagamento com Mercado Pago - Checkout Pro

## Visão Geral

Este documento descreve o fluxo completo de pagamento implementado usando Mercado Pago com Checkout Pro e OAuth (Contas Conectadas).

## Arquitetura

### 1. Autenticação OAuth (Contas Conectadas)

O sistema usa OAuth do Mercado Pago para conectar contas de empresas (sellers), permitindo que recebam pagamentos diretamente em suas contas.

**Arquivos Relacionados:**
- **Backend:**
  - `src/services/mercadoPagoOAuthService.js` - Gerencia OAuth, tokens e refresh
  - `src/controllers/mercadoPagoIntegrationController.js` - Endpoints de conexão
  - `src/routes/mercadoPagoIntegrationRoutes.js` - Rotas de integração

**Fluxo:**
1. Empresa clica em "Conectar Mercado Pago" no painel
2. Sistema gera URL de autorização com `state` assinado
3. Usuário autoriza no Mercado Pago
4. MP redireciona para callback com `code`
5. Sistema troca `code` por `access_token` e `refresh_token`
6. Tokens são salvos no banco de dados (modelo `User`)

**Modelo de Dados (User):**
```javascript
{
  mpUserId: String,          // ID do usuário no MP
  mpAccessToken: TEXT,       // Token de acesso
  mpRefreshToken: TEXT,      // Token de refresh
  mpTokenExpiresAt: DATE,    // Data de expiração
  paymentsEnabled: Boolean   // Se pagamentos estão ativos
}
```

### 2. Criação do Agendamento

**Fluxo:**
1. Cliente acessa página de agendamento: `/agendamento/:businessSlug`
2. Cliente seleciona serviço, data, horário e preenche dados
3. Sistema cria agendamento no banco de dados

**Arquivos:**
- `frontend/src/pages/Booking.jsx` - Interface de agendamento
- `src/controllers/appointmentController.js` - Criação de agendamento
- `src/routes/appointmentRoutes.js` - Rotas de agendamento

### 3. Checkout Pro (Pagamento)

**Fluxo:**
1. Após criar agendamento, sistema verifica se empresa tem pagamentos ativos
2. Se sim, cria preferência no Mercado Pago via API
3. Cliente é redirecionado para página do MP para pagar
4. Pagamento é feito diretamente na conta da empresa (não passa pela plataforma)

**Arquivos:**
- `src/services/mercadoPagoPreferenceService.js` - Criação de preferências
- `src/controllers/mercadoPagoPaymentController.js` - Controller de pagamento
- `src/routes/mercadoPagoPaymentRoutes.js` - Rotas de pagamento

**Endpoint Principal:**
```
POST /api/payments/checkout-pro
Body: {
  bookingId: number,
  companyId: number,
  items: Array,
  payer: Object,
  metadata: Object
}
```

**Preferência criada inclui:**
- `items`: Serviço(s) sendo pago(s)
- `external_reference`: ID do agendamento
- `payer`: Dados do cliente
- `back_urls`: URLs de retorno (sucesso, erro, pendente)
- `notification_url`: URL do webhook
- `metadata`: Informações adicionais (appointment_id, business_id)

### 4. Métodos de Pagamento Suportados

O Checkout Pro suporta automaticamente:
- **PIX** - Pagamento instantâneo
- **Cartão de Crédito** - Até 12x
- **Cartão de Débito**
- **Boleto Bancário**
- **Mercado Pago (saldo em conta)**

### 5. URLs de Retorno

Após o pagamento, o MP redireciona o cliente para uma das páginas:

**Arquivos:**
- `frontend/src/pages/pagamento/Sucesso.jsx` - Pagamento aprovado
- `frontend/src/pages/pagamento/Erro.jsx` - Pagamento rejeitado
- `frontend/src/pages/pagamento/Pendente.jsx` - Pagamento pendente (PIX, Boleto)

**Rotas:**
```
/pagamento/sucesso - Pagamento aprovado
/pagamento/erro - Pagamento rejeitado/cancelado
/pagamento/pendente - Aguardando confirmação (PIX, Boleto)
```

**Parâmetros recebidos do MP:**
- `collection_id` ou `payment_id` - ID do pagamento
- `collection_status` ou `status` - Status do pagamento
- `external_reference` - ID do agendamento
- `preference_id` - ID da preferência criada
- Parâmetros customizados:
  - `booking_slug` - Slug da empresa
  - `booking_url` - URL da página de booking
  - `appointment_id` - ID do agendamento

**Fluxo nas páginas de retorno:**
1. Página carrega e exibe mensagem apropriada
2. Busca dados do agendamento via API
3. Aguarda 2-4 segundos (para webhook processar)
4. Redireciona automaticamente para `/agendamento/:businessSlug?view=appointments&appointment_id=X`

### 6. Webhooks

Webhooks são fundamentais para sincronizar o status do pagamento em tempo real.

**Arquivos:**
- `src/services/mercadoPagoWebhookService.js` - Validação e registro
- `src/controllers/mercadoPagoWebhookController.js` - Processamento
- `src/routes/mercadoPagoWebhookRoutes.js` - Rota do webhook
- `src/services/mercadoPagoPaymentService.js` - Busca e atualização de pagamentos

**Endpoint:**
```
POST /api/webhooks/mercadopago
```

**Fluxo:**
1. MP envia notificação para webhook
2. Sistema valida assinatura HMAC-SHA256
3. Registra evento no banco de dados (`MercadoPagoWebhookEvent`)
4. Busca dados completos do pagamento usando token da empresa
5. Atualiza agendamento com status do pagamento
6. Marca webhook como processado

**Topics suportados:**
- `payment` - Notificação de pagamento
- `merchant_order` - Notificação de pedido

**Status de Pagamento:**
- `pending` - Aguardando pagamento
- `approved` - Pagamento aprovado
- `authorized` - Autorizado (pré-autorização)
- `in_process` - Em processamento
- `in_mediation` - Em mediação
- `rejected` - Rejeitado
- `cancelled` - Cancelado
- `refunded` - Reembolsado
- `charged_back` - Chargeback

### 7. Atualização do Status no Booking

Após retorno das páginas de pagamento, o cliente é redirecionado para:
```
/agendamento/:businessSlug?view=appointments&appointment_id=X&payment_status=Y
```

**Fluxo no Booking.jsx:**
1. Detecta query params `view=appointments` e `appointment_id`
2. Automaticamente muda para visualização "Meus Agendamentos"
3. Busca dados do agendamento via `/api/agendamentos/:id/status`
4. Exibe agendamento com status atualizado
5. Mostra toast apropriado baseado em `payment_status`:
   - `approved` → "Pagamento aprovado! Seu agendamento está confirmado."
   - `pending` → "Pagamento pendente. Você será notificado quando for confirmado."
   - `failed` → "Não foi possível processar o pagamento. Tente novamente."

### 8. Modelo de Dados (Appointment)

```javascript
{
  // Dados do agendamento
  clientName: String,
  clientEmail: String,
  clientPhone: String,
  appointmentDate: DATEONLY,
  appointmentTime: TIME,
  status: ENUM('pending', 'confirmed', 'rejected', 'rescheduled', 'canceled'),

  // Dados de pagamento Mercado Pago
  mpPreferenceId: String,      // ID da preferência criada
  mpPaymentId: String,         // ID do pagamento no MP
  mpExternalReference: String, // Referência externa (ID do agendamento)
  amount: DECIMAL(10, 2),      // Valor do pagamento
  currency: String,            // Moeda (BRL)

  // Status de pagamento
  paymentStatus: ENUM(
    'not_required',      // Não requer pagamento
    'pending',          // Aguardando pagamento
    'in_process',       // Em processamento
    'paid',             // Pago
    'partially_refunded', // Parcialmente reembolsado
    'refunded',         // Reembolsado
    'cancelled',        // Cancelado
    'failed'            // Falhou
  ),
  statusPagamento: ENUM('pendente', 'pago', 'reembolsado'),
  valorPago: DECIMAL(10, 2)
}
```

## Configuração

### Variáveis de Ambiente (.env)

```bash
# Credenciais MP (Dashboard do MP → Suas integrações → Sua aplicação)
MP_CLIENT_ID=your_client_id
MP_CLIENT_SECRET=your_client_secret

# Token da plataforma (para webhooks e consultas)
MP_PLATFORM_ACCESS_TOKEN=your_platform_token

# URLs
MP_OAUTH_REDIRECT_URI=https://yourdomain.com/api/integrations/mercadopago/oauth/callback
MP_WEBHOOK_PUBLIC_URL=https://yourdomain.com/api/webhooks/mercadopago

# Secret para validar webhooks (Dashboard MP → Webhooks → Secret)
MP_WEBHOOK_SECRET=your_webhook_secret

# URLs de retorno do Checkout Pro
NEXT_PUBLIC_MP_SUCCESS_URL=https://yourdomain.com/pagamento/sucesso
NEXT_PUBLIC_MP_FAILURE_URL=https://yourdomain.com/pagamento/erro
NEXT_PUBLIC_MP_PENDING_URL=https://yourdomain.com/pagamento/pendente

# URLs base
CLIENT_URL=https://yourdomain.com
SERVER_URL=https://yourdomain.com
```

### Configuração no Mercado Pago

1. **Criar Aplicação:**
   - Acesse: https://www.mercadopago.com.br/developers/panel/app
   - Crie uma nova aplicação
   - Anote o `Client ID` e `Client Secret`

2. **Configurar Redirect URI:**
   - Nas configurações da aplicação
   - Adicione: `https://yourdomain.com/api/integrations/mercadopago/oauth/callback`

3. **Configurar Webhook:**
   - Acesse: Webhooks na aplicação
   - Adicione URL: `https://yourdomain.com/api/webhooks/mercadopago`
   - Configure eventos: `payment` e `merchant_order`
   - Anote o Secret gerado

4. **Obter Access Token da Plataforma:**
   - Acesse: Credenciais de produção/teste
   - Copie o Access Token da aplicação

## Endpoints da API

### Pagamentos

```
POST   /api/payments/checkout-pro              # Iniciar checkout
GET    /api/payments                           # Listar pagamentos recentes
GET    /api/payments/settings                  # Configurações de pagamento
PATCH  /api/payments/settings                  # Atualizar configurações
```

### Integração MP

```
GET    /api/integrations/mercadopago/connect-url     # URL de conexão OAuth
GET    /api/integrations/mercadopago/status          # Status da integração
GET    /api/integrations/mercadopago/oauth/callback  # Callback OAuth
POST   /api/integrations/mercadopago/disconnect      # Desconectar conta
```

### Webhooks

```
POST   /api/webhooks/mercadopago                     # Receber notificações
```

### Agendamentos

```
POST   /api/empresa/:id/agendamentos                 # Criar agendamento
GET    /api/agendamentos/:id/status                  # Status do agendamento (público)
GET    /api/empresa/:id/agendamentos-cliente         # Buscar agendamentos do cliente
DELETE /api/agendamentos/:id                         # Cancelar agendamento
```

## Testes

### Testar OAuth

1. Acesse o painel da empresa
2. Vá em "Configurações de Pagamento"
3. Clique em "Conectar Mercado Pago"
4. Faça login com conta de teste do MP
5. Autorize a aplicação
6. Verifique se status aparece como "Conectado"

### Testar Checkout Pro

**Cartão de Teste (aprovado):**
```
Número: 5031 4332 1540 6351
Vencimento: 11/25
CVV: 123
Nome: APRO
CPF: 123.456.789-01
```

**PIX de Teste:**
- Gerar QR Code de teste
- Status fica pendente (não há pagamento real em teste)

### Testar Webhook

Use ngrok para expor localhost:
```bash
ngrok http 3000
```

Atualize `MP_WEBHOOK_PUBLIC_URL` com URL do ngrok.

### Testar Fluxo Completo

1. Acesse página de agendamento: `/agendamento/:businessSlug`
2. Selecione serviço, data e horário
3. Preencha dados do cliente
4. Finalize agendamento
5. Será redirecionado para Checkout Pro do MP
6. Faça pagamento com cartão de teste
7. Será redirecionado para `/pagamento/sucesso`
8. Aguarde redirect automático
9. Verifique agendamento em "Meus Agendamentos"
10. Verifique que status do pagamento está "Pago"

## Segurança

### Validação de Webhook

O sistema valida webhooks usando HMAC-SHA256:

```javascript
// Cálculo da assinatura
const signatureString = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
const digest = crypto.createHmac('sha256', MP_WEBHOOK_SECRET)
  .update(signatureString)
  .digest('hex');
```

### Refresh de Token

Tokens são automaticamente atualizados quando expiram:
```javascript
await ensureValidAccessToken(business);
```

### Idempotência

Criação de preferências usa `X-Idempotency-Key` para evitar duplicatas.

## Logs e Monitoramento

O sistema usa logger estruturado para todos os eventos:

```javascript
logger.audit('mercadopago.checkout_pro.init', { appointmentId, businessId });
logger.error('mercadopago.webhook.signature_invalid', { signature });
logger.info('mercadopago.webhook.payment_processed', { paymentId, status });
```

## Troubleshooting

### "Token Mercado Pago inválido ou expirado"
- Token expirou ou foi revogado
- Empresa precisa reconectar conta MP

### "Empresa não está conectada ao Mercado Pago"
- `mpAccessToken` está vazio no banco
- Empresa precisa completar OAuth

### Webhook não está sendo recebido
- Verificar URL pública está acessível
- Verificar webhook configurado no dashboard MP
- Verificar firewall/ngrok

### Pagamento aprovado mas status não atualiza
- Verificar logs do webhook
- Verificar se signature validation está correta
- Verificar se `MP_WEBHOOK_SECRET` está correto

## Referências

- [Documentação Mercado Pago - Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/landing)
- [Documentação OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/introduction)
- [Documentação Webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
- [API Reference](https://www.mercadopago.com.br/developers/pt/reference)
