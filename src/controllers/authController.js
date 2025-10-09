const { Op } = require("sequelize");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const config = require("../config/config");

/**
 * Registra um novo usuário no sistema.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.register = async (req, res) => {
  const { name, businessName, businessType = "Geral", email, password } = req.body;

  try {
    // Validação básica
    if (!name || !businessName || !email || !password) {
      return res.status(400).json({ message: "Todos os campos obrigatórios devem ser preenchidos." });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Formato de e-mail inválido." });
    }
    if (!validator.isLength(password, { min: 6 })) {
      return res.status(400).json({ message: "A senha deve ter no mínimo 6 caracteres." });
    }

    const userExists = await User.findOne({ where: { email } });
    if (userExists) {
      return res.status(400).json({ message: "Este e-mail já está em uso." });
    }

    const user = await User.create({
      name,
      businessName,
      businessType,
      email,
      password,
    });

    // Geração do Access Token (curta duração)
    const accessToken = jwt.sign(
      { id: user.id, name: user.name, business: user.businessName },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Geração do Refresh Token (longa duração)
    const refreshToken = jwt.sign(
      { id: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Salva o refresh token no banco de dados
    user.refreshToken = refreshToken;
    await user.save();

    // Envia o refresh token em um cookie httpOnly
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: config.env === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/api/auth',
    });

    res.status(201).json({
      message: "Usuário criado com sucesso!",
      token: accessToken, // Envia o access token no corpo da resposta
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error("Erro no registro de usuário:", error);
    res.status(500).json({ message: "Erro interno do servidor ao registrar usuário.", error: error.message });
  }
};

/**
 * Gera um novo access token a partir de um refresh token válido.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token não encontrado." });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const user = await User.findOne({ where: { id: decoded.id, refreshToken } });

    if (!user) {
      return res.status(403).json({ message: "Refresh token inválido ou revogado." });
    }

    const accessToken = jwt.sign(
      { id: user.id, name: user.name, business: user.businessName },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.status(200).json({
      token: accessToken,
    });
  } catch (error) {
    console.error("Erro ao renovar token:", error);
    // Limpa o cookie inválido no cliente
    res.cookie("refreshToken", "", {
        httpOnly: true,
        secure: config.env === "production",
        expires: new Date(0),
        path: '/api/auth',
    });
    return res.status(403).json({ message: "Sessão expirada. Faça o login novamente." });
  }
};

/**
 * Realiza o login de um usuário.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "E-mail ou senha inválidos." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "E-mail ou senha inválidos." });
    }

    // Geração do Access Token (curta duração)
    const accessToken = jwt.sign(
      { id: user.id, name: user.name, business: user.businessName },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Geração do Refresh Token (longa duração)
    const refreshToken = jwt.sign(
      { id: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Salva o refresh token no banco de dados
    user.refreshToken = refreshToken;
    await user.save();

    // Envia o refresh token em um cookie httpOnly
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: config.env === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/api/auth', // Garante que o cookie seja enviado apenas para as rotas de autenticação
    });

    res.status(200).json({
      message: "Login bem-sucedido!",
      token: accessToken, // Envia o access token no corpo da resposta
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        onboardingCompleted: user.onboardingCompleted,
      },
      onboardingRequired: !user.onboardingCompleted,
    });
  } catch (error) {
    console.error("Erro no login de usuário:", error);
    res.status(500).json({ message: "Erro interno do servidor ao fazer login.", error: error.message });
  }
};

/**
 * Middleware para proteger rotas, verificando o token JWT.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 * @param {Function} next - Próxima função middleware.
 */
exports.protect = async (req, res, next) => {
  let token;

  // Verificar token no cookie
  if (req.cookies.token) {
    token = req.cookies.token;
  }
  
  // Verificar token no header Authorization
  if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  
  if (!token) {
    if (req.originalUrl.startsWith("/api")) {
      return res.status(401).json({ message: "Não autorizado. Faça o login." });
    }
    return res.redirect("/login"); // Redireciona para a página de login se não for uma API
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = await User.findByPk(decoded.id);
    if (!req.user) {
      return res.status(401).json({ message: "O token pertence a um usuário que não existe mais." });
    }
    next();
  } catch (error) {
    console.error("Erro na proteção de rota:", error);
    if (req.originalUrl.startsWith("/api")) {
      return res.status(401).json({ message: "Token inválido ou expirado." });
    }
    return res.redirect("/login");
  }
};

/**
 * Obtém o perfil do usuário logado.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.getProfile = async (req, res) => {
  if (req.user) {
    res.status(200).json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      businessName: req.user.businessName,
      phone: req.user.phone,
      onboardingCompleted: req.user.onboardingCompleted,
    });
  } else {
    res.status(404).json({ message: "Usuário não encontrado." });
  }
};

/**
 * Atualiza o perfil do usuário logado.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    const { name, businessName, email, phone, password } = req.body;
    user.name = name || user.name;
    user.businessName = businessName || user.businessName;
    user.email = email || user.email;
    user.phone = phone || user.phone;

    if (password) {
      user.password = password; // O hook beforeSave no modelo User cuidará da criptografia
    }

    await user.save();
    res.status(200).json({
      message: "Perfil atualizado com sucesso.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        phone: user.phone,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    res.status(500).json({ message: "Erro interno do servidor ao atualizar perfil.", error: error.message });
  }
};

/**
 * Realiza o logout do usuário, limpando o cookie de autenticação.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.logout = async (req, res) => {
  const { refreshToken } = req.cookies;

  // Limpa o cookie do refresh token no cliente
  res.cookie("refreshToken", "", {
    httpOnly: true,
    secure: config.env === "production",
    expires: new Date(0), // Expira o cookie imediatamente
    path: '/api/auth',
  });

  if (!refreshToken) {
    // Se não houver refresh token, apenas retorna sucesso
    return res.status(200).json({ status: "success", message: "Logout realizado (sem token para invalidar)." });
  }

  try {
    // Encontra o usuário pelo refresh token e o remove do banco de dados
    const user = await User.findOne({ where: { refreshToken } });
    if (user) {
      user.refreshToken = null;
      await user.save();
    }

    res.status(200).json({ status: "success", message: "Logout realizado com sucesso." });
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
    res.status(500).json({ message: "Erro interno do servidor ao fazer logout." });
  }
};

/**
 * Marca o onboarding do usuário como completo.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.completeOnboarding = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    user.onboardingCompleted = true;
    await user.save();
    res.status(200).json({ message: "Onboarding concluído com sucesso." });
  } catch (error) {
    console.error("Erro ao completar onboarding:", error);
    res.status(500).json({ message: "Erro interno do servidor ao completar onboarding.", error: error.message });
  }
};

/**
 * Verifica um código de redefinição de senha.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.verifyResetCode = async (req, res) => {
  try {
    const { token, code } = req.body;

    if (!token || !code) {
      return res.status(400).json({ message: "Token e código são necessários." });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      where: {
        passwordResetToken: hashedToken,
        passwordResetCode: code,
        passwordResetExpires: { [Op.gt]: Date.now() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Código ou token inválido, ou o tempo expirou." });
    }

    res.status(200).json({ message: "Código verificado com sucesso." });
  } catch (error) {
    console.error("Erro ao verificar código de redefinição:", error);
    res.status(500).json({ message: "Ocorreu um erro interno do servidor ao verificar o código." });
  }
};

/**
 * Solicita a redefinição de senha, enviando um e-mail com código e token.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user) {
      // Retorna 200 OK mesmo se o usuário não for encontrado para evitar enumeração de usuários
      return res.status(200).json({ message: "Se o e-mail estiver em nosso sistema, um link de recuperação será enviado." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetCode = Math.floor(1000 + Math.random() * 9000).toString();

    user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.passwordResetCode = resetCode;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutos de validade
    await user.save();
    
    const resetURL = `http://localhost:3000/verificar-codigo.html?token=${resetToken}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap");
          </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Poppins', sans-serif; background-color: #f8f9fa;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; margin-top: 20px; margin-bottom: 20px;">
              <tr>
                  <td align="center" bgcolor="#704abf" style="padding: 30px 0; background: linear-gradient(135deg, #704abf 0%, #9c6fff 100%);">
                      <h1 style="color: #ffffff; font-size: 28px; margin: 0;">AgendaPro</h1>
                  </td>
              </tr>
              <tr>
                  <td bgcolor="#ffffff" style="padding: 40px 30px;">
                      <h2 style="color: #333; font-size: 24px; margin-top: 0;">Recuperação de Senha</h2>
                      <p style="color: #555; font-size: 16px; line-height: 1.6;">
                          Olá, ${user.name}! Recebemos uma solicitação para redefinir a senha da sua conta no AgendaPro.
                      </p>
                      <p style="color: #555; font-size: 16px; line-height: 1.6;">
                          Utilize o código de verificação abaixo para continuar:
                      </p>
                      <div style="background-color: #f1f3f5; border-radius: 8px; text-align: center; padding: 20px; margin: 25px 0;">
                          <span style="font-size: 32px; font-weight: 700; color: #704abf; letter-spacing: 1em; padding-left: 1em;">${resetCode}</span>
                      </div>
                      <p style="color: #555; font-size: 16px; text-align: center;">
                          Ou clique no botão abaixo para ir diretamente para a página de redefinição:
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                              <td align="center" style="padding: 20px 0;">
                                  <a href="${resetURL}" target="_blank" style="background-color: #704abf; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
                                      Redefinir Senha
                                  </a>
                              </td>
                          </tr>
                      </table>
                      <p style="color: #555; font-size: 16px; line-height: 1.6;">
                          Se você não solicitou a redefinição de senha, por favor, ignore este e-mail.
                      </p>
                  </td>
              </tr>
              <tr>
                  <td bgcolor="#f1f3f5" style="padding: 20px 30px; text-align: center;">
                      <p style="margin: 0; color: #999; font-size: 12px;">
                          &copy; 2025 AgendaPro. Todos os direitos reservados.
                      </p>
                  </td>
              </tr>
          </table>
      </body>
      </html>
    `;

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: "AgendaPro <suporte@agendapro.com>",
      to: user.email,
      subject: "Recuperação de Senha - AgendaPro",
      html: emailHtml,
    });
    
    res.status(200).json({ message: "E-mail de recuperação enviado!" });
  } catch (err) {
    console.error("Erro ao enviar e-mail de recuperação:", err);
    res.status(500).json({ message: "Erro interno do servidor ao processar a solicitação de recuperação de senha." });
  }
};

/**
 * Redefine a senha do usuário após a verificação do código.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, password, code } = req.body;

    if (!token || !password || !code || !validator.isLength(password, { min: 6 })) {
      return res.status(400).json({ message: "Token, código e uma senha válida (mínimo 6 caracteres) são necessários." });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    
    const user = await User.findOne({
      where: {
        passwordResetToken: hashedToken,
        passwordResetCode: code,
        passwordResetExpires: { [Op.gt]: Date.now() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Token ou código inválido, ou o tempo expirou." });
    }

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.passwordResetCode = null;
    await user.save();

    res.status(200).json({ message: "Senha redefinida com sucesso!" });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    res.status(500).json({ message: "Ocorreu um erro interno do servidor ao tentar redefinir a senha." });
  }
};

/**
 * Deleta um usuário de teste (apenas para ambientes de desenvolvimento/teste).
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.deleteTestUser = async (req, res) => {
  if (config.env !== "development" && config.env !== "test") {
    return res.status(403).json({ message: "Esta operação é permitida apenas em ambientes de desenvolvimento/teste." });
  }
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "Usuário de teste não encontrado." });
    }
    await user.destroy();
    res.status(204).send();
  } catch (error) {
    console.error("Erro ao deletar usuário de teste:", error);
    res.status(500).json({ message: "Erro interno do servidor ao deletar usuário de teste.", error: error.message });
  }
};

