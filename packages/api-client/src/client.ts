export interface ApiClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(response.status, error.message || response.statusText);
    }

    return response.json();
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let searchParams = "";
    if (params) {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        // Handle arrays: create multiple params with same key
        if (Array.isArray(value)) {
          for (const item of value) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
          }
        } else {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
      }
      if (parts.length > 0) {
        searchParams = `?${parts.join("&")}`;
      }
    }

    return this.request<T>(`${endpoint}${searchParams}`);
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "DELETE",
    });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

let clientInstance: ApiClient | null = null;

export function initApiClient(config: ApiClientConfig): void {
  clientInstance = new ApiClient(config);
}

export function getApiClient(): ApiClient {
  if (!clientInstance) {
    throw new Error("ApiClient not initialized. Call initApiClient first.");
  }
  return clientInstance;
}
