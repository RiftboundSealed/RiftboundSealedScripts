import axios from "axios";

export async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const config = {
      method: 'get',
      maxBodyLength: Infinity,
      url,
      headers: { 
        'Accept': 'application/json'
      }
    };

    const res = await axios.request(config);

    if (res.status !== 200) {
      const body =
        typeof res.data === "string"
          ? res.data
          : res.data != null
            ? JSON.stringify(res.data)
            : "";
      throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${body}`);
    }

    return (res.data) as T;
  } finally {
    clearTimeout(t);
  }
}