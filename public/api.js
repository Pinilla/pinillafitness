export class LoggedOut extends Error {}

export async function request(method, path, body) {
  const response = await fetch(path, requestOptions(method, body));
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") {
    throw new LoggedOut();
  }
  if (!response.ok) {
    throw new Error(data.error ?? `Something went wrong (HTTP ${response.status}).`);
  }
  return data;
}

function requestOptions(method, body) {
  if (body === undefined) {
    return { method };
  }
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
