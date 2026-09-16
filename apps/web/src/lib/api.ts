const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers as Record<string, string>,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const workspaceId = typeof window !== "undefined" ? localStorage.getItem("workspaceId") : null;
  if (workspaceId) {
    headers["X-Workspace-Id"] = workspaceId;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(error.error?.message || "Request failed");
  }

  return response.json();
}

/**
 * Upload one or more files with real progress via XHR.
 * Files: ZIP archive and/or individual LinkedIn CSV/JSON files.
 */
export function uploadImportWithProgress(
  files: File[],
  onProgress: (percent: number) => void
): Promise<{ data: { importId: string; jobId: string; status: string; fileCount: number; rejected: { filename: string; reason: string }[] } }> {
  return new Promise((resolve, reject) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const workspaceId = typeof window !== "undefined" ? localStorage.getItem("workspaceId") : null;

    const formData = new FormData();
    for (const f of files) formData.append("files", f, f.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/v1/imports/upload`);

    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (workspaceId) xhr.setRequestHeader("X-Workspace-Id", workspaceId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          reject(new Error(body?.error?.message || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload — check your connection and try again"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — try a smaller file or check your connection"));

    xhr.send(formData);
  });
}

export const api = {
  // People
  getPeople: (params?: Record<string, string>) =>
    fetchApi<{ data: any[]; pagination: any }>(
      `/api/v1/people${params ? "?" + new URLSearchParams(params).toString() : ""}`
    ),

  getPerson: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/people/${id}`),

  // Companies
  getCompanies: (params?: Record<string, string>) =>
    fetchApi<{ data: any[]; pagination: any }>(
      `/api/v1/companies${params ? "?" + new URLSearchParams(params).toString() : ""}`
    ),

  getCompany: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/companies/${id}`),

  // Messages
  getMessages: (params?: Record<string, string>) =>
    fetchApi<{ data: any[]; pagination: any }>(
      `/api/v1/messages${params ? "?" + new URLSearchParams(params).toString() : ""}`
    ),

  // Conversations
  getConversations: (params?: Record<string, string>) =>
    fetchApi<{ data: any[]; pagination: any }>(
      `/api/v1/conversations${params ? "?" + new URLSearchParams(params).toString() : ""}`
    ),

  getConversation: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/conversations/${id}`),

  // Jobs
  getJobs: (params?: Record<string, string>) =>
    fetchApi<{ data: any[]; pagination: any }>(
      `/api/v1/jobs${params ? "?" + new URLSearchParams(params).toString() : ""}`
    ),

  getJobApplications: () =>
    fetchApi<{ data: any[]; pagination: any }>("/api/v1/jobs/applications"),

  getSavedJobs: () =>
    fetchApi<{ data: any[]; pagination: any }>("/api/v1/jobs/saved"),

  // Analytics
  getNetworkAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/network"),

  getCommunicationAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/communication"),

  getOutreachAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/outreach"),

  getCareerAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/career"),

  getContentAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/content"),

  getRelationshipAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/relationships"),

  getDataQualityAnalytics: () =>
    fetchApi<{ data: any }>("/api/v1/analytics/data-quality"),

  // Search
  search: (query: string, types?: string[]) =>
    fetchApi<{ data: any[]; total: number }>(
      `/api/v1/search?q=${encodeURIComponent(query)}${types ? "&types=" + types.join(",") : ""}`
    ),

  // AI
  chat: (message: string, provider: string = "openai", model: string = "gpt-4o-mini") =>
    fetchApi<{ data: any }>("/api/v1/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, provider, model }),
    }),

  getTools: () =>
    fetchApi<{ data: any[] }>("/api/v1/ai/tools"),

  // Credentials
  getCredentials: () =>
    fetchApi<{ data: any[] }>("/api/v1/credentials"),

  addCredential: (provider: string, apiKey: string) =>
    fetchApi<{ data: any }>("/api/v1/credentials", {
      method: "POST",
      body: JSON.stringify({ provider, apiKey }),
    }),

  deleteCredential: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/credentials/${id}`, {
      method: "DELETE",
    }),

  testCredential: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/credentials/${id}/test`, {
      method: "POST",
    }),

  // Imports
  getImports: () =>
    fetchApi<{ data: any[]; pagination: any }>("/api/v1/imports"),

  cancelImport: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/imports/${id}/cancel`, { method: "POST" }),

  getImport: (id: string) =>
    fetchApi<{ data: any }>(`/api/v1/imports/${id}`),

  uploadImport: async (file: File) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const workspaceId = typeof window !== "undefined" ? localStorage.getItem("workspaceId") : null;
    
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/api/v1/imports/upload`, {
      method: "POST",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(workspaceId && { "X-Workspace-Id": workspaceId }),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: "Upload failed" } }));
      throw new Error(error.error?.message || "Upload failed");
    }

    return response.json();
  },

  // Graph
  getGraphOverview: () =>
    fetchApi<{ data: any }>("/api/v1/graph/overview"),

  getPersonGraph: (personId: string, depth: number = 2) =>
    fetchApi<{ data: any }>(`/api/v1/graph/person/${personId}?depth=${depth}`),
};
