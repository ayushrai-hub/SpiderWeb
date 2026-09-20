import type {
  Company,
  CompanyDetail,
  ConversationDetail,
  Conversation,
  Dashboard,
  Facets,
  GraphData,
  ImportDetail,
  ImportSummary,
  JobRow,
  Me,
  Opportunity,
  Paginated,
  Person,
  PersonDetail,
  SearchHit,
  AnalyticsReport,
  AnalystAnswer,
  AnalyticsRecord,
  RelevanceBreakdown,
} from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

/** An error carrying the API's machine-readable code alongside its message. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiRequestError(
      "NETWORK_ERROR",
      `Could not reach the SpiderWeb API at ${API_BASE}. Check that it is running.`,
      0
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiRequestError(
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `The request failed (${response.status}).`,
      response.status,
      error?.details
    );
  }
  return body as T;
}

type QueryParams = Record<string, string | number | undefined | null>;

function qs(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export interface PeopleQuery {
  q?: string;
  company?: string;
  pastCompany?: string;
  title?: string;
  location?: string;
  industry?: string;
  school?: string;
  tag?: string;
  connectedAfter?: string;
  connectedBefore?: string;
  signals?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export const api = {
  me: () => request<{ data: Me }>("/api/v1/me"),

  dashboard: () => request<{ data: Dashboard }>("/api/v1/dashboard"),
  analytics: () => request<{ data: AnalyticsReport }>("/api/v1/analytics"),
  analyticsRecords: (metric: string, value?: string) =>
    request<{ data: AnalyticsRecord[]; total: number; metric: string; value: string | null }>(
      `/api/v1/analytics/records${qs({ metric, value })}`
    ),
  ask: (q: string) => request<{ data: AnalystAnswer; query: string }>(`/api/v1/analytics/ask${qs({ q })}`),
  targetedOpportunities: (
    params: {
      company?: string;
      pastCompany?: string;
      role?: string;
      industry?: string;
      location?: string;
      recentlyMoved?: boolean;
      olderQuiet?: boolean;
      limit?: number;
    } = {}
  ) =>
    request<{ data: Opportunity[] }>(
      `/api/v1/analytics/opportunities${qs({
        ...params,
        recentlyMoved: params.recentlyMoved ? "true" : undefined,
        olderQuiet: params.olderQuiet ? "true" : undefined,
      })}`
    ),
  personContext: (id: string) => request<{ data: RelevanceBreakdown }>(`/api/v1/people/${id}/context`),
  opportunities: (limit = 20) => request<{ data: Opportunity[] }>(`/api/v1/opportunities${qs({ limit })}`),

  people: (params: PeopleQuery = {}) =>
    request<Paginated<Person>>(`/api/v1/people${qs(params as QueryParams)}`),
  facets: () => request<{ data: Facets }>("/api/v1/people/facets"),
  person: (id: string) => request<{ data: PersonDetail }>(`/api/v1/people/${id}`),

  addNote: (personId: string, body: string) =>
    request<{ data: PersonDetail["notes"][number] }>(`/api/v1/people/${personId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  updateNote: (noteId: string, body: string) =>
    request<{ data: PersonDetail["notes"][number] }>(`/api/v1/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),
  deleteNote: (noteId: string) => request<void>(`/api/v1/notes/${noteId}`, { method: "DELETE" }),

  setTags: (personId: string, tags: string[]) =>
    request<{ data: { tags: string[] } }>(`/api/v1/people/${personId}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    }),
  tags: () => request<{ data: { id: string; name: string; count: number }[] }>("/api/v1/tags"),

  companies: (params: { q?: string; page?: number; limit?: number; sort?: string } = {}) =>
    request<Paginated<Company>>(`/api/v1/companies${qs(params)}`),
  company: (id: string) => request<{ data: CompanyDetail }>(`/api/v1/companies/${id}`),

  graph: (params: { companyId?: string; minSize?: number; includeSchools?: boolean } = {}) =>
    request<{ data: GraphData }>(
      `/api/v1/graph${qs({
        companyId: params.companyId,
        minSize: params.minSize,
        includeSchools: params.includeSchools === false ? "false" : undefined,
      })}`
    ),

  search: (q: string, types?: string[]) =>
    request<{ data: SearchHit[]; total: number }>(`/api/v1/search${qs({ q, types: types?.join(",") })}`),

  conversations: (params: { q?: string; page?: number; limit?: number } = {}) =>
    request<Paginated<Conversation>>(`/api/v1/conversations${qs(params)}`),
  conversation: (id: string) => request<{ data: ConversationDetail }>(`/api/v1/conversations/${id}`),

  jobs: (params: { page?: number; limit?: number } = {}) =>
    request<Paginated<JobRow>>(`/api/v1/jobs${qs(params)}`),

  imports: (params: { page?: number; limit?: number } = {}) =>
    request<Paginated<ImportSummary>>(`/api/v1/imports${qs(params)}`),
  importDetail: (id: string) => request<{ data: ImportDetail }>(`/api/v1/imports/${id}`),
  deleteImport: (id: string, withData: boolean) =>
    request<{ data: { importId: string; removedPeople: number } }>(
      `/api/v1/imports/${id}${qs({ withData: withData ? "true" : undefined })}`,
      { method: "DELETE" }
    ),
  refreshAnalytics: () =>
    request<{ data: Record<string, number> }>("/api/v1/imports/refresh-analytics", { method: "POST" }),
  resetNetwork: () =>
    request<{ data: { deletedPeople: number } }>("/api/v1/network/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "DELETE" }),
    }),

  exportUrl: (name: "connections.csv" | "companies.csv" | "network.json" | "analytics.json") =>
    `${API_BASE}/api/v1/exports/${name}`,
};

export interface UploadResult {
  data: {
    importId: string;
    status: string;
    mode: "inline" | "queue";
    filename: string;
    fileCount: number;
    totalBytes: number;
    rejected: { filename: string; reason: string }[];
    /** Set when this exact upload was processed before. */
    previouslyImportedAt: string | null;
  };
}

export interface UploadHandle {
  promise: Promise<UploadResult>;
  cancel: () => void;
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/** Upload with real progress and a working cancel, via XHR. */
export function uploadImport(files: File[], onProgress: (percent: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadResult>((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append("files", file, file.name);

    xhr.open("POST", `${API_BASE}/api/v1/imports`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: (ErrorBody & Partial<UploadResult>) | null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.data) {
        resolve(body as UploadResult);
      } else {
        reject(
          new ApiRequestError(
            body?.error?.code ?? "UPLOAD_FAILED",
            body?.error?.message ?? `The upload failed (${xhr.status}).`,
            xhr.status,
            body?.error?.details
          )
        );
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiRequestError(
          "NETWORK_ERROR",
          "The connection dropped during upload. Check your network and try again.",
          0
        )
      );
    xhr.onabort = () => reject(new ApiRequestError("UPLOAD_CANCELLED", "Upload cancelled.", 0));
    xhr.ontimeout = () =>
      reject(
        new ApiRequestError("UPLOAD_TIMEOUT", "The upload timed out. Try again on a faster connection.", 0)
      );
    xhr.send(form);
  });

  return { promise, cancel: () => xhr.abort() };
}
