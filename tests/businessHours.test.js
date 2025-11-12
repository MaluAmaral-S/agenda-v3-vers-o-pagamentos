const axios = require("axios");

describe("BusinessHours API", () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    // Register and login a user to get an auth token
    try {
      await axios.post("http://localhost:3000/api/auth/register", {
        name: "BusinessHours Test User",
        businessName: "BusinessHours Test Business",
        businessType: "Test Type",
        email: "businesshours_test@example.com",
        password: "password123",
      });
    } catch (error) {
      if (error.response?.status !== 409) {
        throw error;
      }
    }
    const loginResponse = await axios.post("http://localhost:3000/api/auth/login", {
      email: "businesshours_test@example.com",
      password: "password123",
    });
    authToken = loginResponse.data.accessToken;
    userId = loginResponse.data.user.id;
  });

  it("should create/update business hours", async () => {
    const businessHoursData = {
      businessHours: {
        "0": { isOpen: false, intervals: [] }, // Sunday
        "1": { isOpen: true, intervals: [{ start: "09:00", end: "17:00" }] }, // Monday
        "2": { isOpen: true, intervals: [{ start: "09:00", end: "17:00" }] }, // Tuesday
        "3": { isOpen: true, intervals: [{ start: "09:00", end: "17:00" }] }, // Wednesday
        "4": { isOpen: true, intervals: [{ start: "09:00", end: "17:00" }] }, // Thursday
        "5": { isOpen: true, intervals: [{ start: "09:00", end: "17:00" }] }, // Friday
        "6": { isOpen: false, intervals: [] }, // Saturday
      },
    };
    const response = await axios.post("http://localhost:3000/api/business-hours", businessHoursData, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.data.businessHours["1"].isOpen).toBe(true);
    expect(response.data.businessHours["1"].intervals[0].start).toBe("09:00");
  });

  it("should get business hours for the user", async () => {
    const response = await axios.get("http://localhost:3000/api/business-hours", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.data.businessHours["1"].isOpen).toBe(true);
  });

  afterAll(async () => {
    // Clean up the test user
    await axios.delete(`http://localhost:3000/api/auth/delete-test-user/${userId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    }).catch(() => {}); // Ignore error if user already deleted
  });
});
