import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresHiveMapStore } from "@hivemap/storage";

import { createApiRequestHandler, type ApiRequestHandler } from "./index.js";

const POSTGRES_TEST_URL = process.env.HIVEMAP_TEST_POSTGRES_URL;
const describeIfPostgres = POSTGRES_TEST_URL === undefined ? describe.skip : describe;

describeIfPostgres("api server on Postgres", () => {
  let store: PostgresHiveMapStore;
  let handleRequest: ApiRequestHandler;

  beforeAll(async () => {
    store = PostgresHiveMapStore.open(POSTGRES_TEST_URL as string);
    await store.initialize();
  });

  beforeEach(async () => {
    handleRequest = createApiRequestHandler({ store });
  });

  afterEach(async () => {
    await Promise.resolve();
  });

  afterAll(async () => {
    await store.close();
  });

  it("preserves workspace, graph, and ZIP semantics on a Postgres-backed server", async () => {
    const workspaceId = `pg-api-${randomUUID()}`;
    const workspace = {
      id: workspaceId,
      slug: `${workspaceId}-slug`,
      name: `Postgres API Workspace ${workspaceId}`,
      createdAt: "2026-08-19T21:20:00.000Z",
      updatedAt: "2026-08-19T21:20:00.000Z",
    };

    try {
      const createResponse = await postJson(handleRequest, "/workspaces", { workspace });
      expect(createResponse.status).toBe(201);
      expect(parseJson(createResponse)).toEqual({ workspace });

      const commandResponse = await postJson(handleRequest, `/workspaces/${workspace.id}/commands`, {
        commands: [
          {
            id: "cmd-root",
            type: "node.create",
            payload: { node: { id: "root", label: "Root", type: "concept" } },
          },
        ],
      });
      expect(commandResponse.status).toBe(200);

      const listResponse = await request(handleRequest, "/workspaces");
      expect(listResponse.status).toBe(200);
      const listBody = parseJson<{ workspaces: Array<typeof workspace> }>(listResponse);
      expect(listBody.workspaces.find((candidate) => candidate.id === workspace.id)).toEqual(workspace);

      const exportResponse = await postJson(handleRequest, `/workspaces/${workspace.id}/export-bundle`, {
        exportedAt: "2026-08-19T21:21:00.000Z",
      });
      expect(exportResponse.status).toBe(200);
      const zip = exportResponse.body;

      await store.deleteWorkspace(workspace.id);

      const importResponse = await request(handleRequest, "/workspace-import-bundles?mode=new", {
        method: "POST",
        headers: { "content-type": "application/zip" },
        body: zip,
      });
      expect(importResponse.status).toBe(201);
      expect(parseJson(importResponse) as unknown).toMatchObject({ workspace });

      const workspaceResponse = await request(handleRequest, `/workspaces/${workspace.id}`);
      expect(workspaceResponse.status).toBe(200);
      expect(parseJson(workspaceResponse) as unknown).toEqual({
        state: expect.objectContaining({
          workspace,
          graphId: `${workspace.id}:graph`,
          graph: {
            nodes: [{ id: "root", label: "Root", type: "concept" }],
            edges: [],
          },
          categoryCatalog: expect.objectContaining({
            categories: expect.any(Array),
          }),
          categoryAssignments: [],
          capturePolicy: expect.objectContaining({
            mode: "delegated",
          }),
          feedbackEvents: [],
          proposals: [],
          projections: [],
          scanProfiles: expect.any(Array),
          scanRuns: [],
        }),
      });
    } finally {
      if (await store.workspaceExists(workspace.id)) {
        await store.deleteWorkspace(workspace.id);
      }
    }
  });
});

type Response = {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

async function postJson(handleRequest: ApiRequestHandler, pathname: string, body: unknown): Promise<Response> {
  return request(handleRequest, pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function request(
  handleRequest: ApiRequestHandler,
  pathname: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
  } = {},
): Promise<Response> {
  const request = new MockRequest(init.method ?? "GET", pathname, init.body);
  const response = new MockResponse();
  handleRequest(request as never, response as never);
  await response.done;
  return { status: response.statusCode, headers: response.headers, body: response.body };
}

function parseJson<T>(response: Response): T {
  return JSON.parse(response.body.toString("utf8")) as T;
}

class MockRequest extends Readable {
  readonly method: string;
  readonly url: string;
  private bodySent = false;
  private readonly body: Buffer | string | undefined;

  constructor(method: string, url: string, body?: Buffer | string) {
    super();
    this.method = method;
    this.url = url;
    this.body = body;
  }

  override _read(): void {
    if (this.bodySent) {
      return;
    }
    this.bodySent = true;
    if (this.body !== undefined) {
      this.push(this.body);
    }
    this.push(null);
  }
}

class MockResponse {
  statusCode = 200;
  headers: IncomingHttpHeaders = {};
  private readonly chunks: Buffer[] = [];
  private resolveDone!: () => void;
  readonly done = new Promise<void>((resolve) => {
    this.resolveDone = resolve;
  });

  writeHead(statusCode: number, headers: IncomingHttpHeaders): ServerResponse {
    this.statusCode = statusCode;
    this.headers = headers;
    return this as never;
  }

  end(chunk?: Buffer | string): this {
    if (chunk !== undefined) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.resolveDone();
    return this;
  }

  get body(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
