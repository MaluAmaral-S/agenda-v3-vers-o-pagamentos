const axios = require("axios");

describe("Service API", () => {
  let authToken;
  let userId;
  let serviceId;

  beforeAll(async () => {
    // Register and login a user to get an auth token
    try {
      await axios.post("http://localhost:3000/api/auth/register", {
        name: "Service Test User",
        businessName: "Service Test Business",
        businessType: "Service Type",
        email: "service_test@example.com",
        password: "password123",
      });
    } catch (error) {
      if (error.response?.status !== 409) {
        throw error;
      }
    }
    const loginResponse = await axios.post("http://localhost:3000/api/auth/login", {
      email: "service_test@example.com",
      password: "password123",
    });
    authToken = loginResponse.data.accessToken;
    userId = loginResponse.data.user.id;
  });

  it("should create a new service", async () => {
    const response = await axios.post("http://localhost:3000/api/servicos", {
      nome: "Corte de Cabelo",
      descricao: "Corte masculino e feminino",
      duracao_minutos: 30,
      preco: 50.00,
    }, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBe(201);
    expect(response.data.nome).toBe("Corte de Cabelo");
    serviceId = response.data.id;
  });

  it("should get all services for the user", async () => {
    const response = await axios.get("http://localhost:3000/api/servicos", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0].nome).toBe("Corte de Cabelo");
  });

  it("should update a service", async () => {
    const response = await axios.put(`http://localhost:3000/api/servicos/${serviceId}`, {
      nome: "Corte de Cabelo e Barba",
      preco: 75.00,
    }, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.data.nome).toBe("Corte de Cabelo e Barba");
    expect(response.data.preco).toBe(75);
  });

  it("should delete a service", async () => {
    const response = await axios.delete(`http://localhost:3000/api/servicos/${serviceId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBe(204);
  });

  afterAll(async () => {
    // Clean up the test user
    await axios.delete(`http://localhost:3000/api/auth/delete-test-user/${userId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    }).catch(() => {}); // Ignore error if user already deleted
  });
});
