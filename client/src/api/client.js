const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let accessToken = null;

export const setToken = (t) => { accessToken = t; };
export const getToken = () => accessToken;

export const api = async (path, { method = 'GET', body, isForm = false } = {}) => {
  const headers = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
};