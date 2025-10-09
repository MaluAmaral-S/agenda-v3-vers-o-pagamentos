const axios = require("axios");

describe("Auth API", () => {
  it("should register a new user", async () => {
    const response = await axios.post("http://localhost:3000/api/auth/register", {
      name: "Test User",
      businessName: "Test Business",
      businessType: "Test Type",
      email: "test@example.com",
      password: "password123",
    });
    expect(response.status).toBe(201);
    expect(response.data.user.email).toBe("test@example.com");
  });

  it("should login a user", async () => {
    const response = await axios.post("http://localhost:3000/api/auth/login", {
      email: "test@example.com",
      password: "password123",
    });
    expect(response.status).toBe(200);
    expect(response.data.token).toBeDefined();
  });
});

