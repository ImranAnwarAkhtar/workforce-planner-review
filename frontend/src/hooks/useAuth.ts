const AUTH_KEY = 'wfp_auth';
const USER_KEY = 'wfp_user';

export interface WfpUser {
  name: string;
  email: string;
  role: string;
  system_profile?: string | null;
  access_tier?: string | null;
}

export function isLoggedIn(): boolean {
  return localStorage.getItem(AUTH_KEY) === 'true';
}

export function login(user: WfpUser): void {
  localStorage.setItem(AUTH_KEY, 'true');
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): WfpUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as WfpUser) : null;
  } catch {
    return null;
  }
}
