// src/controllers/authController.js
// Autenticação com hash (bcryptjs) + refresh token (cookie httpOnly)
// - register: cria usuário com hash e preenche campos obrigatórios
// - login: valida senha e emite access + refresh
// - refresh: renova access token a partir do cookie 'rt'
// - logout: limpa cookie 'rt'

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { issueAccessToken, issueRefreshToken, verifyRefresh } = require('../utils/jwt');
const { hashPassword, verifyPassword } = require('../utils/password');

/** Tenta carregar o Model User de locais comuns do projeto */
function loadUserModel() {
  const candidates = [
    '../models',            // padrão comum: src/models/index.js
    '../database/models',   // às vezes fica aqui
  ];
  for (const rel of candidates) {
    try {
      const mod = require(rel);
      // Possíveis jeitos de exportar:
      if (mod?.User) return mod.User;
      if (mod?.Users) return mod.Users;
      if (mod?.models?.User) return mod.models.User;
    } catch (_) { /* tenta próxima opção */ }
  }
  return null;
}

const User = loadUserModel();

let mailer;

function getMailer() {
  if (mailer !== undefined) {
    return mailer;
  }

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST) {
    console.warn('[mail] EMAIL_HOST nǜo configurado; c��digos de recupera��ǜo serǜo logados apenas.');
    mailer = null;
    return mailer;
  }

  const port = Number(EMAIL_PORT || 587);
  mailer = nodemailer.createTransport({
    host: EMAIL_HOST,
    port,
    secure: port === 465,
    auth: EMAIL_USER && EMAIL_PASS ? { user: EMAIL_USER, pass: EMAIL_PASS } : undefined,
  });

  return mailer;
}

async function sendResetEmail(to, code) {
  const transport = getMailer();
  const subject = 'C��digo de recupera��ǜo de senha';
  const text = [
    'Ol��!',
    '',
    `Seu c��digo de verifica��ǜo Ǹ: ${code}`,
    'Ele expira em 15 minutos.',
    '',
    'Se vocǦ nǜo solicitou a troca de senha, ignore este email.',
    '',
    'Equipe AgendaPro',
  ].join('\n');

  if (!transport) {
    console.log(`[mail] Reset code para ${to}: ${code}`);
    return;
  }

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@agendapro.local';
  await transport.sendMail({ to, from, subject, text });
}

function isResetRequestValid(user) {
  if (!user?.passwordResetCode || !user?.passwordResetExpires) return false;
  return new Date(user.passwordResetExpires) > new Date();
}

/** Define o cookie httpOnly do refresh token */
function setRefreshCookie(res, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('rt', refreshToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : (process.env.COOKIE_SAMESITE || 'lax'),
    secure: isProd ? true : (process.env.COOKIE_SECURE === 'true'),
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
    path: '/api/auth',
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
}

/** Reduz o objeto do usuário para retornar ao frontend */
/**
 * Reduz o objeto do usuário que vem do banco para um payload
 * que será armazenado no frontend. Além dos campos básicos
 * (id, email, name, role), também expomos businessName,
 * businessType e phone para que a aplicação consiga gerar
 * um link público de agendamento e exibir outras informações
 * do negócio. Se algum desses campos não existir no objeto
 * retornado pelo ORM, eles serão definidos como null para
 * manter a consistência da interface no frontend.
 *
 * @param {Object} u Objeto do usuário retornado pelo ORM
 * @returns {Object|null} Objeto com campos seguros para o frontend
 */
function publicUser(u) {
  if (!u) return null;
  const o = typeof u.toJSON === 'function' ? u.toJSON() : u;
  return {
    id: o.id,
    email: o.email,
    name: o.name || o.nome || null,
    role: o.role || o.perfil || 'user',
    businessName: o.businessName || null,
    businessType: o.businessType || null,
    phone: o.phone || null,
  };
}

// -------------------- REGISTER --------------------
async function register(req, res) {
  try {
    if (!User) {
      return res.status(500).json({ message: 'Model User não encontrado. Ajuste o import em src/controllers/authController.js' });
    }

    const { name, email, password, phone, businessName, businessType } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email já cadastrado' });

    // Descobre campos do Model para evitar notNull
    const attrs = User.rawAttributes || {};

    // Campos NOT NULL que precisam de valor já no cadastro
    const mustBusinessName = attrs.businessName && attrs.businessName.allowNull === false;
    const mustBusinessType = attrs.businessType && attrs.businessType.allowNull === false;

    // Descobre qual campo o Model usa para o hash de senha
    const passFields = [];
    if (attrs.password) passFields.push('password');         // comum
    if (attrs.passwordHash) passFields.push('passwordHash'); // alguns projetos
    if (attrs.senha) passFields.push('senha');               // pt-BR em alguns casos
    if (passFields.length === 0) passFields.push('password'); // fallback seguro

    const hashed = await hashPassword(password);

    const payload = {
      name: name ?? null,
      email,
      phone: phone ?? null,
      onboardingCompleted: false,
      // Se o Model marca NOT NULL, preenche um default “neutro”
      businessName: (businessName ?? (mustBusinessName ? 'Meu Negócio' : null)),
      businessType: (businessType ?? (mustBusinessType ? 'outro' : null)),
    };

    // Preenche todos os campos de senha detectados (evita notNull no Model)
    for (const f of passFields) payload[f] = hashed;

    const user = await User.create(payload);

    const accessToken = issueAccessToken({ id: user.id, role: user.role || 'user' });
    const refreshToken = issueRefreshToken({ id: user.id, tokenVersion: user.tokenVersion || 0 });
    setRefreshCookie(res, refreshToken);

    return res.status(201).json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error('Erro no register:', err);
    return res.status(500).json({ message: 'Erro ao registrar usuário' });
  }
}

// -------------------- LOGIN --------------------
async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    if (!User) {
      return res.status(500).json({ message: 'Model User não encontrado. Ajuste o import em src/controllers/authController.js' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Credenciais inválidas' });

    const obj = typeof user.toJSON === 'function' ? user.toJSON() : user;

    // Detecta onde está armazenado o hash
    const storedHash = obj.passwordHash || obj.password || obj.senha || null;
    if (!storedHash) {
      return res.status(500).json({ message: 'Hash de senha não encontrado no usuário (ajuste o Model para usar "password" ou "passwordHash").' });
    }

    const ok = await verifyPassword(password, storedHash);
    if (!ok) return res.status(401).json({ message: 'Credenciais inválidas' });

    const accessToken = issueAccessToken({ id: user.id, role: user.role || 'user' });
    const refreshToken = issueRefreshToken({ id: user.id, tokenVersion: user.tokenVersion || 0 });
    setRefreshCookie(res, refreshToken);

    return res.json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ message: 'Erro no login' });
  }
}

// -------------------- REFRESH --------------------
async function refresh(req, res) {
  try {
    const token = req.cookies?.rt;
    if (!token) return res.status(401).json({ code: 'NO_REFRESH' });

    const payload = verifyRefresh(token);

    // Opcional: validar tokenVersion no BD aqui, se você usar esse controle
    const newAccess = issueAccessToken({ id: payload.id, role: payload.role || 'user' });
    const newRefresh = issueRefreshToken({ id: payload.id, tokenVersion: payload.tokenVersion || 0 });
    setRefreshCookie(res, newRefresh);

    return res.json({ accessToken: newAccess });
  } catch (err) {
    return res.status(401).json({ code: 'INVALID_REFRESH' });
  }
}

// -------------------- LOGOUT --------------------
async function logout(_req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('rt', {
    path: '/api/auth',
    sameSite: isProd ? 'none' : (process.env.COOKIE_SAMESITE || 'lax'),
    secure: isProd ? true : (process.env.COOKIE_SECURE === 'true'),
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
  return res.json({ ok: true });
}

// -------------------- PASSWORD RECOVERY --------------------
async function forgotPassword(req, res) {
  try {
    if (!User) {
      return res.status(500).json({ message: 'Model User nǜo encontrado.' });
    }

    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email Ǹ obrigat��rio.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Resposta gen��rica para evitar enumera��ǜo
      return res.json({ message: 'Se o email estiver cadastrado, enviaremos instru����es.' });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = await hashPassword(code);
    const token = crypto.randomBytes(32).toString('hex');

    user.passwordResetCode = hashedCode;
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
    await user.save();

    try {
      await sendResetEmail(user.email, code);
    } catch (mailErr) {
      console.error('Erro ao enviar email de recupera��ǜo:', mailErr);
      // Continua executando para permitir que o c��digo seja usado mesmo sem email
    }

    return res.json({ message: 'Se o email estiver cadastrado, enviaremos instru����es.' });
  } catch (err) {
    console.error('Erro no forgotPassword:', err);
    return res.status(500).json({ message: 'Erro ao iniciar recupera��ǜo de senha.' });
  }
}

async function verifyResetCode(req, res) {
  try {
    if (!User) {
      return res.status(500).json({ message: 'Model User nǜo encontrado.' });
    }

    const email = (req.body?.email || '').trim().toLowerCase();
    const code = (req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ message: 'Email e c��digo sǜo obrigat��rios.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !isResetRequestValid(user)) {
      return res.status(400).json({ message: 'C��digo de verifica��ǜo invǭlido ou expirado.' });
    }

    const isValid = await verifyPassword(code, user.passwordResetCode);
    if (!isValid) {
      return res.status(400).json({ message: 'C��digo de verifica��ǜo invǭlido ou expirado.' });
    }

    return res.json({ message: 'C��digo verificado com sucesso.' });
  } catch (err) {
    console.error('Erro no verifyResetCode:', err);
    return res.status(500).json({ message: 'Erro ao verificar c��digo.' });
  }
}

async function resetPassword(req, res) {
  try {
    if (!User) {
      return res.status(500).json({ message: 'Model User nǜo encontrado.' });
    }

    const email = (req.body?.email || '').trim().toLowerCase();
    const code = (req.body?.code || '').trim();
    const newPassword = req.body?.newPassword || '';

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, c��digo e nova senha sǜo obrigat��rios.' });
    }

    if (newPassword.length < 6) {
      return res.status(422).json({ message: 'A nova senha deve ter ao menos 6 caracteres.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !isResetRequestValid(user)) {
      return res.status(400).json({ message: 'C��digo de verifica��ǜo invǭlido ou expirado.' });
    }

    const isValid = await verifyPassword(code, user.passwordResetCode);
    if (!isValid) {
      return res.status(400).json({ message: 'C��digo de verifica��ǜo invǭlido ou expirado.' });
    }

    user.password = newPassword;
    user.passwordResetCode = null;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    return res.json({ message: 'Senha atualizada com sucesso.' });
  } catch (err) {
    console.error('Erro no resetPassword:', err);
    return res.status(500).json({ message: 'Erro ao redefinir senha.' });
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  verifyResetCode,
  resetPassword,
};
