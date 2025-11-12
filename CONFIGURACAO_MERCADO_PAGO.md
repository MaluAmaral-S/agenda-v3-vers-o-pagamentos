# Guia de Configuração - Mercado Pago

## 📋 Variáveis de Ambiente Configuradas

### ✅ Backend (`.env` na raiz do projeto)

```bash
# --- Mercado Pago Platform Token ---
# Token da sua aplicação no Mercado Pago
# Usado para: fazer consultas em nome da plataforma (webhooks)
MP_PLATFORM_ACCESS_TOKEN=APP_USR-2386137476405106-103114-c62f83ad7ee5c5c405481bd40483cc94-1713081040

# --- Webhook ---
# URL pública onde o Mercado Pago enviará notificações de pagamento
MP_WEBHOOK_PUBLIC_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/webhooks/mercadopago

# Secret para validar assinatura dos webhooks (HMAC-SHA256)
MP_WEBHOOK_SECRET=a2852031ed1178fec68bcc49daa7fed3eed4aca92682041002a5afc835ff8b8a

# Desabilitar validação de assinatura (APENAS para desenvolvimento local)
MP_WEBHOOK_DISABLE_SIGNATURE_VALIDATION=false

# --- OAuth (Contas Conectadas) ---
# Client ID da sua aplicação
MP_CLIENT_ID=2386137476405106

# Client Secret da sua aplicação
MP_CLIENT_SECRET=USwRqo6fl3wp24mBHUa29Ublr7NOXypS

# URL de callback após autorização OAuth
MP_OAUTH_REDIRECT_URI=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/integrations/mercadopago/oauth/callback

# --- URLs de Retorno do Checkout Pro ---
# Para onde o MP redireciona após o pagamento
NEXT_PUBLIC_MP_SUCCESS_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/sucesso
NEXT_PUBLIC_MP_FAILURE_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/erro
NEXT_PUBLIC_MP_PENDING_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/pendente

# --- URLs Base ---
CLIENT_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev
SERVER_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev

# --- CORS ---
CORS_ORIGIN=http://localhost:5173, https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev
```

### ✅ Frontend (`frontend/.env`)

```bash
# URL do backend (API)
VITE_API_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api

# URL base do frontend
VITE_BASE_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev

# URLs de retorno (compatibilidade)
VITE_MP_SUCCESS_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/sucesso
VITE_MP_FAILURE_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/erro
VITE_MP_PENDING_URL=https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/pendente

# Modo de desenvolvimento
VITE_CONNECT_TEST_MODE_ALLOW_ALL=true
VITE_MP_USE_SANDBOX=true

# Janela de reembolso em dias
VITE_REFUND_WINDOW_DAYS=7
```

---

## 🔧 Configuração no Dashboard do Mercado Pago

### 1️⃣ Acessar o Dashboard

Acesse: https://www.mercadopago.com.br/developers/panel/app

### 2️⃣ Verificar/Criar Aplicação

Certifique-se de que a aplicação existe com:
- **Client ID:** `2386137476405106`
- **Client Secret:** `USwRqo6fl3wp24mBHUa29Ublr7NOXypS`

### 3️⃣ Configurar Redirect URIs (OAuth)

**Importante:** No Dashboard da sua aplicação, vá em **"Configurações OAuth"** e adicione:

```
https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/integrations/mercadopago/oauth/callback
```

⚠️ **ATENÇÃO:** O Mercado Pago é muito rigoroso com essa URL. Ela deve ser:
- Exatamente igual (sem barra no final)
- HTTPS (ngrok já fornece)
- Cadastrada no dashboard antes de testar

### 4️⃣ Configurar Webhook

**No Dashboard da aplicação:**

1. Vá em **"Webhooks"**
2. Clique em **"Configurar notificações"**
3. Configure:
   - **URL de produção/teste:**
     ```
     https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/webhooks/mercadopago
     ```
   - **Eventos:**
     - ✅ `payment` (Pagamentos)
     - ✅ `merchant_order` (Pedidos)

4. **Secret do Webhook:**
   - Copie o secret gerado pelo MP
   - Substitua em `MP_WEBHOOK_SECRET` no `.env`

### 5️⃣ Configurar URLs de Retorno (Checkout Pro)

**No Dashboard da aplicação, seção "Checkout Pro":**

Configure as URLs de retorno (opcional, mas recomendado):
- **Success:** `https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/sucesso`
- **Failure:** `https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/erro`
- **Pending:** `https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/pendente`

---

## 🧪 Como Testar

### 1. Iniciar Ngrok
```bash
ngrok http 3000
```

⚠️ **IMPORTANTE:** Sempre que o ngrok reiniciar, você receberá uma **nova URL**. Você precisará:
1. Atualizar **todos** os `.env` com a nova URL
2. Atualizar no Dashboard do Mercado Pago:
   - Redirect URI do OAuth
   - URL do Webhook
3. Reiniciar backend e frontend

### 2. Iniciar Backend
```bash
npm run dev
```

### 3. Iniciar Frontend
```bash
cd frontend
npm run dev
```

### 4. Testar OAuth (Conectar Conta)

1. Acesse: `https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/painel`
2. Faça login
3. Vá em "Pagamentos" ou "Configurações"
4. Clique em "Conectar Mercado Pago"
5. Autorize com conta de teste do MP
6. Verifique se status muda para "Conectado"

### 5. Testar Checkout Pro (Pagamento)

1. Acesse página de agendamento de uma empresa conectada
2. Crie um novo agendamento
3. Será redirecionado para o Mercado Pago
4. Use dados de teste:

**Cartão de Crédito (Aprovado):**
```
Número: 5031 4332 1540 6351
Vencimento: 11/25
CVV: 123
Nome: APRO
CPF: 12345678909
```

**Cartão de Crédito (Rejeitado):**
```
Número: 5031 4332 1540 6351
Vencimento: 11/25
CVV: 123
Nome: OTHE
CPF: 12345678909
```

5. Após pagamento, será redirecionado para:
   - Sucesso: `/pagamento/sucesso`
   - Erro: `/pagamento/erro`
   - Pendente: `/pagamento/pendente`

6. Aguarde alguns segundos e será redirecionado para ver seu agendamento

### 6. Testar Webhook

1. Faça um pagamento como descrito acima
2. Verifique logs do backend para ver webhook sendo recebido
3. Verifique se status do agendamento é atualizado

**Logs importantes:**
```
mercadopago.webhook.signature_computed
mercadopago.webhook.payment_processed
```

---

## 🔍 Verificar se Está Funcionando

### Backend Funcionando:
```bash
curl https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/health
```

### Webhook Acessível:
```bash
curl -X POST https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

Deve retornar erro de validação (é esperado), mas significa que está acessível.

---

## 🚨 Troubleshooting

### ❌ Erro: "Redirect URI não cadastrada"

**Solução:**
1. Vá no Dashboard do MP
2. Adicione exatamente: `https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/integrations/mercadopago/oauth/callback`
3. Aguarde 1-2 minutos para propagar
4. Tente novamente

### ❌ Webhook não está sendo recebido

**Possíveis causas:**
1. **Ngrok bloqueando:** Adicione `--verify-webhook false` ao ngrok
2. **URL errada:** Verifique se a URL no Dashboard MP está correta
3. **Firewall:** Verifique se porta 3000 está aberta

**Testar manualmente:**
```bash
curl -v https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/webhooks/mercadopago
```

### ❌ "Invalid signature" no webhook

**Solução:**
1. Verifique se `MP_WEBHOOK_SECRET` está correto
2. Copie o secret do Dashboard do MP
3. Cole exatamente no `.env`
4. Reinicie o backend

**Alternativa temporária (apenas dev):**
```bash
MP_WEBHOOK_DISABLE_SIGNATURE_VALIDATION=true
```

### ❌ CORS Error

**Solução:** Verifique se `CORS_ORIGIN` no backend inclui:
```bash
CORS_ORIGIN=http://localhost:5173, https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev
```

### ❌ Ngrok "Visit Site" Warning

**Solução:**
1. Adicione ngrok auth token:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

2. Ou desabilite o warning (não recomendado):
```bash
ngrok http 3000 --host-header=rewrite
```

---

## 📝 Checklist de Configuração

Use esta checklist para garantir que tudo está configurado:

### Backend (.env)
- [ ] `MP_PLATFORM_ACCESS_TOKEN` preenchido
- [ ] `MP_CLIENT_ID` preenchido
- [ ] `MP_CLIENT_SECRET` preenchido
- [ ] `MP_WEBHOOK_SECRET` preenchido
- [ ] `MP_WEBHOOK_PUBLIC_URL` com URL do ngrok
- [ ] `MP_OAUTH_REDIRECT_URI` com URL do ngrok
- [ ] URLs de retorno (`NEXT_PUBLIC_MP_*`) com URL do ngrok
- [ ] `CLIENT_URL` com URL do ngrok
- [ ] `SERVER_URL` com URL do ngrok
- [ ] `CORS_ORIGIN` inclui URL do ngrok

### Frontend (.env)
- [ ] `VITE_API_URL` com URL do ngrok + `/api`
- [ ] `VITE_BASE_URL` com URL do ngrok
- [ ] URLs de pagamento (`VITE_MP_*`) com URL do ngrok

### Dashboard Mercado Pago
- [ ] Redirect URI do OAuth cadastrada
- [ ] Webhook URL cadastrada
- [ ] Eventos `payment` e `merchant_order` habilitados
- [ ] Secret do webhook copiado para `.env`

### Servidores
- [ ] Backend rodando na porta 3000
- [ ] Frontend rodando (Vite)
- [ ] Ngrok apontando para porta 3000
- [ ] Banco de dados PostgreSQL rodando

---

## 🎯 Resumo das URLs Importantes

| Tipo | URL |
|------|-----|
| **Frontend** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev |
| **Backend (API)** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api |
| **OAuth Callback** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/integrations/mercadopago/oauth/callback |
| **Webhook** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/api/webhooks/mercadopago |
| **Sucesso** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/sucesso |
| **Erro** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/erro |
| **Pendente** | https://jibingly-nonencyclopaedic-wilda.ngrok-free.dev/pagamento/pendente |

---

## 📞 Suporte

Se tiver problemas:
1. Verifique logs do backend
2. Verifique logs do ngrok
3. Verifique Dashboard do Mercado Pago > Atividade da aplicação
4. Consulte: [FLUXO_PAGAMENTO_MERCADO_PAGO.md](./FLUXO_PAGAMENTO_MERCADO_PAGO.md)

---

**Última atualização:** 12/11/2025
