import { FeedbackEvent, GraphNode, GraphResponse, ViewNode } from "./types";

export async function fetchGraph(): Promise<GraphResponse> {
  return readJson<GraphResponse>(await fetch("/api/graph"));
}

export async function saveNode(node: GraphNode): Promise<void> {
  await readJson(await postJson("/api/nodes", node));
}

export async function saveViewNode(viewNode: ViewNode): Promise<void> {
  await readJson(await postJson("/api/view/nodes", viewNode));
}

export async function sendFeedback(type: FeedbackEvent["type"], payload: Record<string, unknown>): Promise<void> {
  await readJson(await postJson("/api/feedback", { type, payload }));
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function readJson<T = unknown>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}
