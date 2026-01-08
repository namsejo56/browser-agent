// Authentication manager for OAuth and API Key
class AuthManager {
  constructor() {
    this.authType = null; // 'oauth' or 'apikey'
    this.accessToken = null;
    this.apiKey = null;
    this.apiKeyModel = null; // Store the working model for API key
    this.isLoadedFromManifest = false; // Track if API key is from manifest
  }

  async initialize() {
    const data = await chrome.storage.local.get([
      "authType",
      "apiKey",
      "accessToken",
      "apiKeyModel",
    ]);
    this.authType = data.authType;
    this.apiKey = data.apiKey;
    this.accessToken = data.accessToken;
    this.apiKeyModel = data.apiKeyModel; // Load stored model for API key

    // Nếu chưa có API key trong storage, lấy từ manifest.json
    if (!this.apiKey && !this.accessToken) {
      await this.loadApiKeyFromManifest();
    }

    return this.isAuthenticated();
  }

  async loadApiKeyFromManifest() {
    try {
      const manifest = chrome.runtime.getManifest();
      const defaultApiKey = manifest.default_api_key;

      if (defaultApiKey && defaultApiKey !== "YOUR_API_KEY_HERE") {
        console.log("Đang tải API key từ manifest.json...");

        // Lưu API key trước để có thể đăng nhập ngay
        this.apiKey = defaultApiKey;
        this.authType = "apikey";
        this.isLoadedFromManifest = true;

        // Tìm model tốt nhất và lưu vào storage
        try {
          const bestModel = await this.findBestModel(defaultApiKey);
          this.apiKeyModel = bestModel;

          await chrome.storage.local.set({
            authType: "apikey",
            apiKey: defaultApiKey,
            apiKeyModel: bestModel,
          });

          console.log(
            "✓ Đã tải API key từ manifest.json thành công với model:",
            bestModel
          );
        } catch (error) {
          // Nếu không tìm được model, dùng model mặc định
          this.apiKeyModel = "gemma-3-27b-it";
          await chrome.storage.local.set({
            authType: "apikey",
            apiKey: defaultApiKey,
            apiKeyModel: this.apiKeyModel,
          });
          console.log("✓ Đã tải API key từ manifest.json với model mặc định");
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error("Lỗi khi tải API key từ manifest:", error);
      return false;
    }
  }

  isAuthenticated() {
    return (
      (this.authType === "oauth" && this.accessToken) ||
      (this.authType === "apikey" && this.apiKey)
    );
  }

  async loginWithGoogle() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(
            new Error(chrome.runtime.lastError?.message || "Login failed")
          );
          return;
        }

        this.accessToken = token;
        this.authType = "oauth";

        await chrome.storage.local.set({
          authType: "oauth",
          accessToken: token,
        });

        resolve(token);
      });
    });
  }

  async listAvailableModels(apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error("Không thể lấy danh sách models");
      }

      const data = await response.json();

      // Free-tier models list (based on Google AI Studio free tier - Dec 2024)
      // Source: https://ai.google.dev/gemini-api/docs/pricing
      const freeTierModels = [
        "gemini-3-flash", // main fast model
        "gemini-2.5-pro", // premium, reasoning (free ≤200k tokens)
        "gemini-2.5-flash", // balanced
        "gemini-2.5-flash-lite", // cheapest & light
        "gemini-2.5-flash-tts", // text-to-speech
        "gemini-2.5-flash-native-audio-dialog", // audio use
        "gemini-robotics-er-1.5-preview", // robotics
        "gemma-3-12b-it", // open source
        "gemma-3-1b-it",
        "gemma-3-27b-it",
        "gemma-3-2b-it",
        "gemma-3-4b-it",
      ];

      // Filter models that support generateContent AND are in free tier
      const models = data.models
        .filter((model) => {
          const modelName = model.name.replace("models/", "");
          return (
            model.supportedGenerationMethods?.includes("generateContent") &&
            freeTierModels.includes(modelName)
          );
        })
        .map((model) => ({
          name: model.name,
          displayName: model.displayName,
          description: model.description,
        }));

      console.log("Free-tier available models:", models);
      return models;
    } catch (error) {
      console.error("Error listing models:", error);
      return [];
    }
  }

  async getModelUsageInfo(modelName, apiKey) {
    try {
      // Get model info which includes usage/quota information
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}?key=${apiKey}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        console.warn("Could not fetch model usage info");
        return null;
      }

      const data = await response.json();
      console.log("Model usage info:", data);

      // Extract rate limit info if available
      return {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        inputTokenLimit: data.inputTokenLimit,
        outputTokenLimit: data.outputTokenLimit,
      };
    } catch (error) {
      console.error("Error getting model usage info:", error);
      return null;
    }
  }

  async findBestModel(apiKey) {
    const models = await this.listAvailableModels(apiKey);

    // Preferred model names in order of preference for FREE TIER
    // Updated based on https://ai.google.dev/gemini-api/docs/pricing (December 2024)
    const preferredModels = [
      "models/gemma-3-27b-it", // Requested for Chat
      "models/gemini-3-flash", // Main fast model, 5 RPM / 20 RPD
      "models/gemini-2.5-flash", // Balanced, 5 RPM / 20 RPD
      "models/gemini-2.5-flash-lite", // Cheapest & light, 10 RPM / 20 RPD
      "models/gemini-2.5-pro", // Premium reasoning, 2 RPM / 10 RPD (≤200k tokens free)
      "models/gemini-1.5-flash", // Stable 1.5, 15 RPM / 1500 RPD
      "models/gemini-1.5-flash-002", // Stable variant
      "models/gemini-1.5-flash-001", // Stable variant
      "models/gemini-2.0-flash-exp", // Experimental 2.0
      "models/gemini-1.5-flash-8b", // Lighter variant
      "models/gemini-pro", // Legacy
      "models/gemini-1.0-pro", // Legacy
    ];

    // Try to find a preferred model
    for (const preferred of preferredModels) {
      const found = models.find((m) => m.name === preferred);
      if (found) {
        console.log("Selected model:", found.name);
        return found.name.replace("models/", "");
      }
    }

    // If no preferred model found, use the first available model
    if (models.length > 0) {
      const fallback = models[0].name.replace("models/", "");
      console.log("Using fallback model:", fallback);
      return fallback;
    }

    // Default fallback to most stable model
    return "gemma-3-27b-it";
  }

  async setApiKey(apiKey) {
    // Validate API key format
    if (!apiKey || apiKey.length < 20) {
      throw new Error("API key không hợp lệ. Vui lòng kiểm tra lại.");
    }

    try {
      // First, get the list of available models and find the best one
      const bestModel = await this.findBestModel(apiKey);
      console.log("Testing with model:", bestModel);

      // Test API key with the found model
      const testResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hi" }] }],
          }),
        }
      );

      if (!testResponse.ok) {
        const errorData = await testResponse.json().catch(() => null);
        const errorMsg = errorData?.error?.message || "";

        if (
          errorMsg.includes("API_KEY_INVALID") ||
          errorMsg.includes("invalid")
        ) {
          throw new Error("API key không hợp lệ. Vui lòng kiểm tra lại.");
        } else if (errorMsg.includes("quota")) {
          throw new Error("API key đã hết quota. Vui lòng tạo key mới.");
        } else {
          throw new Error(
            `Lỗi xác thực API key: ${errorMsg || "Không xác định"}`
          );
        }
      }

      // If successful, save the API key and the best model
      this.apiKey = apiKey;
      this.authType = "apikey";

      await chrome.storage.local.set({
        authType: "apikey",
        apiKey: apiKey,
        apiKeyModel: bestModel, // Store the working model
      });
    } catch (error) {
      // Re-throw with user-friendly message
      if (
        error.message.includes("API key") ||
        error.message.includes("quota")
      ) {
        throw error;
      }
      throw new Error(
        "Không thể kết nối đến Gemini API. Vui lòng kiểm tra kết nối internet."
      );
    }
  }

  async logout() {
    if (this.authType === "oauth" && this.accessToken) {
      // Revoke OAuth token
      await chrome.identity.removeCachedAuthToken({ token: this.accessToken });
    }

    this.authType = null;
    this.accessToken = null;
    this.apiKey = null;
    this.apiKeyModel = null;

    await chrome.storage.local.remove([
      "authType",
      "apiKey",
      "accessToken",
      "apiKeyModel",
    ]);
  }

  getAuthHeaders() {
    if (this.authType === "oauth") {
      return {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      };
    }
    return {
      "Content-Type": "application/json",
    };
  }

  getApiUrl(customModel) {
    const model = customModel || this.getModelPath();
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    if (this.authType === "oauth") {
      return baseUrl;
    }
    return `${baseUrl}?key=${this.apiKey}`;
  }

  getModelPath(typeOverride) {
    const type = typeOverride || this.authType;
    // API keys use the stored model from ListModels API
    // OAuth can use the latest experimental models
    if (type === "apikey") {
      return this.apiKeyModel || "gemma-3-27b-it"; // Use stored or fallback to latest stable
    }
    return "gemini-2.0-flash-exp"; // Latest experimental for OAuth users
  }

  getQuotaLimit() {
    return this.authType === "oauth" ? 1000 : 100;
  }

  // Check if current authentication is still valid
  async validateAuth() {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      const response = await fetch(this.getApiUrl(), {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          contents: [{ parts: [{ text: "test" }] }],
        }),
      });

      if (!response.ok) {
        // Auth is invalid, clear it
        await this.logout();
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Get user-friendly auth type name
  getAuthTypeName() {
    return this.authType === "oauth" ? "Google OAuth" : "API Key";
  }
}

// Export for use in popup.js
window.authManager = new AuthManager();
