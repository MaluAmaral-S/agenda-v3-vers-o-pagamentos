const Service = require("../models/Service");

/**
 * Cria um novo serviço para o usuário autenticado.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.createService = async (req, res) => {
  try {
    const { nome, descricao, duracao_minutos, preco } = req.body;
    const userId = req.user.id; // ID do usuário obtido do middleware de autenticação

    if (!nome || !duracao_minutos) {
      return res.status(400).json({ message: "Nome e duração do serviço são obrigatórios." });
    }
    if (typeof duracao_minutos !== "number" || duracao_minutos <= 0) {
      return res.status(400).json({ message: "A duração do serviço deve ser um número positivo." });
    }
    if (preco !== undefined && (typeof preco !== "number" || preco < 0)) {
      return res.status(400).json({ message: "O preço do serviço deve ser um número não negativo." });
    }

    const newService = await Service.create({
      nome,
      descricao,
      duracao_minutos,
      preco,
      userId,
    });

    res.status(201).json(newService);
  } catch (error) {
    console.error("Erro ao criar serviço:", error);
    res.status(500).json({ message: "Erro interno do servidor ao criar serviço.", error: error.message });
  }
};

/**
 * Lista todos os serviços do usuário autenticado.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.getServices = async (req, res) => {
  try {
    const userId = req.user.id;
    const services = await Service.findAll({ where: { userId } });
    res.status(200).json(services);
  } catch (error) {
    console.error("Erro ao buscar serviços:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar serviços.", error: error.message });
  }
};

/**
 * Atualiza um serviço existente do usuário autenticado.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { nome, descricao, duracao_minutos, preco } = req.body;

    const service = await Service.findOne({ where: { id, userId } });

    if (!service) {
      return res.status(404).json({ message: "Serviço não encontrado ou não pertence a você." });
    }

    if (duracao_minutos !== undefined && (typeof duracao_minutos !== "number" || duracao_minutos <= 0)) {
      return res.status(400).json({ message: "A duração do serviço deve ser um número positivo." });
    }
    if (preco !== undefined && (typeof preco !== "number" || preco < 0)) {
      return res.status(400).json({ message: "O preço do serviço deve ser um número não negativo." });
    }

    service.nome = nome !== undefined ? nome : service.nome;
    service.descricao = descricao !== undefined ? descricao : service.descricao;
    service.duracao_minutos = duracao_minutos !== undefined ? duracao_minutos : service.duracao_minutos;
    service.preco = preco !== undefined ? preco : service.preco;

    await service.save();
    res.status(200).json(service);
  } catch (error) {
    console.error("Erro ao atualizar serviço:", error);
    res.status(500).json({ message: "Erro interno do servidor ao atualizar serviço.", error: error.message });
  }
};

/**
 * Deleta um serviço existente do usuário autenticado.
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 */
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const service = await Service.findOne({ where: { id, userId } });

    if (!service) {
      return res.status(404).json({ message: "Serviço não encontrado ou não pertence a você." });
    }

    await service.destroy();
    res.status(204).send(); // Retorna 204 No Content para deleção bem-sucedida
  } catch (error) {
    console.error("Erro ao deletar serviço:", error);
    res.status(500).json({ message: "Erro interno do servidor ao deletar serviço.", error: error.message });
  }
};

