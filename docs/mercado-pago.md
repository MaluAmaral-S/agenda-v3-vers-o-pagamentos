# Integração Mercado Pago Checkout Pro

## Visão Geral

A plataforma passou a usar o Mercado Pago Checkout Pro como solução de marketplace para cobranças avulsas de agendamentos. Cada empresa conecta a própria conta Mercado Pago via OAuth e recebe 100% do valor, inclusive em pagamentos via Pix.

## Variáveis de Ambiente

Configure no backend (`.env`):

```
MP_PLATFORM_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_WEBHOOK_PUBLIC_URL=
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/mercadopago/callback
MP_DEFAULT_ITEM_CATEGORY_ID=services
NEXT_PUBLIC_MP_SUCCESS_URL=http://localhost:5173/pagamento/sucesso
NEXT_PUBLIC_MP_FAILURE_URL=http://localhost:5173/pagamento/erro
NEXT_PUBLIC_MP_PENDING_URL=http://localhost:5173/pagamento/pendente
```

> **Dica:** em produção a URL de callback deve apontar para `https://minhaapp.com/api/integrations/mercadopago/callback` e o webhook para a rota pública `/api/webhooks/mercadopago`.

## Migração do Banco de Dados

Execute as migrations para criar os novos campos das tabelas `Users`/`Appointments`
e a tabela de logs de reembolso `MercadoPagoRefundLogs`:

```
npm run db:migrate:mercadopago
npm run db:migrate:mercadopago-refunds
```

## Conexão do Seller (OAuth)

1. No painel (`/painel?tab=pagamentos`) clique em **Conectar Mercado Pago**.
2. O seller será redirecionado para o consentimento oficial. Aceitando, retorna ao painel com a conta vinculada (`mpUserId`).
3. O token é renovado automaticamente quando necessário.

## Checkout Pro com Split (repasse 100%)

- O backend cria a preferência via `POST /api/payments/checkout-pro` usando o token do seller.
- Não definimos `marketplace_fee` para garantir repasse integral.
- `notification_url` aponta para `/api/webhooks/mercadopago` e `external_reference` é o ID do agendamento.
- Cada item enviado ao Mercado Pago inclui agora `items.id`, `items.description` e `items.category_id`. A categoria padrão é controlada por `MP_DEFAULT_ITEM_CATEGORY_ID` (fallback `services`), mas pode ser sobrescrita por item ao chamar o serviço. Essas informações elevam a pontuação de aprovação de pagamentos e reduzem bloqueios por antifraude.
- O backend adiciona `X-Idempotency-Key` em cada criação de preferência e preenche `metadata` com `bookingId` e `companyId`.

## Webhooks

- Configure o webhook no painel do Mercado Pago apontando para `MP_WEBHOOK_PUBLIC_URL`.
- Utilize a mesma `MP_WEBHOOK_SECRET` definida no `.env` para validar a assinatura (`x-signature`).
- A aplicação persiste o evento em `MercadoPagoWebhookEvents` e atualiza o status do agendamento automaticamente (`paid`, `pending`, `refunded`, etc.).

## Reembolsos

- Endpoint protegido `POST /api/payments/{paymentId}/refunds` aceita reembolsos totais ou parciais.
- `GET /api/payments/{paymentId}/refunds` lista os reembolsos já realizados e retorna os logs persistidos.
- Em caso de Pix, o Mercado Pago pode manter o status `in_process` até concluir a devolução. O webhook atualizará o agendamento.
- Cada solicitação de reembolso envia `X-Idempotency-Key` e grava um registro em `MercadoPagoRefundLogs` com o payload da API.

## Testes e Ambiente Sandbox

1. Conecte uma conta Mercado Pago de teste via OAuth (ambiente sandbox).
2. Gere um agendamento com serviço pago e acione o fluxo de pagamento; você será redirecionado ao Checkout Pro.
3. Após pagar (Pix ou cartão de teste), aguarde o webhook confirmar o status `paid` e liberar o agendamento.
4. Para validar reembolsos, utilize o endpoint de refund e verifique o status `refunded` no painel.

## Habilitando Pix

Certifique-se de que o seller tenha o Pix ativado no painel do Mercado Pago (`Seu negócio > Configurações > Meios de pagamento`). Caso o método não esteja disponível, a preferência ainda é criada, mas o Checkout não exibirá Pix como opção.
