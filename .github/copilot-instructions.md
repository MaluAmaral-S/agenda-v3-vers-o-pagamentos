# Copilot Instructions for AgendaPro

## Visão Geral da Arquitetura
- O projeto é dividido em três partes principais:
  - `frontend/`: Aplicação React (Vite) para interface do usuário, onboarding, agendamento, planos e assinatura.
  - `src/`: Backend Node.js/Express, com controllers, models, rotas e configuração de banco de dados.
  - `fix_backups/`: Scripts e APIs auxiliares para backup e manutenção.

## Fluxos de Desenvolvimento
- **Frontend**
  - Rodar localmente: `cd frontend && npm install && npm run dev`
  - Build: `npm run build` (gera produção em `frontend/dist`)
  - Lint: `npm run lint`
  - Principais páginas: `src/pages/`, componentes em `src/components/`, contexto em `src/context/`, serviços em `src/services/`
  - UI segue padrão de componentes reutilizáveis em `components/ui/` e hooks customizados em `hooks/`
- **Backend**
  - Rodar localmente: `npm install && npm run dev` (usa `nodemon`)
  - Testes: `npm test` (Jest, arquivos em `tests/`)
  - Configuração de banco: `src/config/database.js` (MySQL por padrão, ver `.env.example`)
  - Rotas RESTful em `src/routes/`, lógica em `src/controllers/`, modelos Sequelize em `src/models/`

## Convenções Específicas
- **Env Vars**: Use `.env.example` como referência para variáveis obrigatórias (Stripe, DB, URLs, JWT, etc).
- **Agendamento**: Serviços e horários são configurados via onboarding (`PrimeirosPassos.jsx`, `OnboardingBusinessHours.jsx`, `OnboardingServices.jsx`). Duração dos serviços é sempre em minutos, convertida por helpers.
- **Planos e Limites**: Lógica de planos e limites mensais em `src/models/Plan.js`, `src/controllers/planController.js`, e helpers em `frontend/src/utils/planLimits.js`.
- **Assinatura**: Integração Stripe em `src/controllers/stripeController.js` e `frontend/src/services/stripeService.js`. Mudança de plano e renovação automática.
- **Autenticação**: JWT, middleware em `src/middleware/auth.js`, contexto React em `frontend/src/context/AuthContext.jsx`.
- **Notificações**: Toasts via `sonner` no frontend, erros do backend retornam mensagens amigáveis.

## Integrações e Comunicação
- **API**: Comunicação via REST entre frontend (`frontend/src/services/api.js`) e backend (`src/routes/`).
- **Stripe**: Pagamentos e assinaturas, IDs e secrets no `.env`.
- **Banco de Dados**: MySQL por padrão, configurável via `.env`.

## Exemplos de Padrões
- Componentes UI: `frontend/src/components/ui/` (ex: `Input`, `Card`, `Button`) usam utilitário `cn` para classes dinâmicas.
- Onboarding: Fluxo guiado em `PrimeirosPassos.jsx` com animações e validações.
- Testes: Arquivos em `tests/`, usam Jest, cobrem controllers principais.

## Dicas para Agentes
- Sempre valide variáveis de ambiente antes de rodar.
- Siga o padrão REST nas rotas e controllers.
- Use helpers para conversão de horários e limites.
- Mantenha consistência nos componentes UI e nos hooks customizados.
- Consulte arquivos de configuração e exemplos para integração Stripe e banco.

---

Seções incompletas ou dúvidas? Solicite exemplos ou esclarecimentos sobre fluxos, integrações ou padrões específicos deste projeto.