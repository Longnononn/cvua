import { QueryClient, QueryFunction } from "@tanstack/react-query";

const TOKEN_KEY = "auth_token";

function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/g, "");
  if (/^\/\//.test(trimmed)) return `https:${trimmed.replace(/\/+$/g, "")}`;
  if (trimmed.startsWith("/")) return trimmed.replace(/\/+$/g, "");
  return `https://${trimmed.replace(/\/+$/g, "")}`;
}

export function getApiBaseUrl() {
  const envApi = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  const normalizedEnvApi = envApi ? normalizeBaseUrl(envApi) : "";
  if (normalizedEnvApi) return normalizedEnvApi;

  const envWs = (import.meta as any).env?.VITE_WS_URL as string | undefined;
  const ws = envWs ? envWs.trim() : "";
  if (!ws) {
    if (
      typeof window !== "undefined" &&
      window.location.hostname.toLowerCase().endsWith(".pages.dev")
    ) {
      return "https://chesspro-api.longnononpro.workers.dev";
    }
    return "";
  }

  try {
    const u = new URL(ws);
    if (u.protocol === "ws:") u.protocol = "http:";
    if (u.protocol === "wss:") u.protocol = "https:";
    u.pathname = u.pathname.replace(/\/ws\/?$/i, "/");
    const path = u.pathname.replace(/\/+$/g, "");
    return path && path !== "/" ? `${u.origin}${path}` : u.origin;
  } catch {
    return "";
  }
}

export const API_BASE_URL = getApiBaseUrl();

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function withAuthHeaders(headers: Record<string, string>) {
  const token = getToken();
  if (token) {
    return { ...headers, Authorization: `Bearer ${token}` };
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(API_BASE_URL + url, {
    method,
    headers: withAuthHeaders(data ? { "Content-Type": "application/json" } : {}),
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(API_BASE_URL + (queryKey.join("/") as string), {
      headers: withAuthHeaders({}),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
