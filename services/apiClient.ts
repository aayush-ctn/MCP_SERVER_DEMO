import { ENV } from "../config/env.js";

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T | null> {
  try {
    const response = await fetch(`${ENV.IXFI_API_BASE}${path}`, {
      ...options,
      headers: {
        "User-Agent": ENV.USER_AGENT,
        Accept: "application/json",
        Authorization: `Bearer ${ENV.IXFI_API_TOKEN}`,
        token: ENV.IXFI_API_TOKEN,
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
