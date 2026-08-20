export type EmbeddingProviderRequest = {
  model: string;
  inputs: string[];
};

export type EmbeddingProvider = {
  id: string;
  maxBatchSize?: number;
  embed(request: EmbeddingProviderRequest): Promise<number[][]>;
};

export type EmbeddingProviderRegistry = Record<string, EmbeddingProvider>;

export class EmbeddingProviderError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = options?.code ?? "EMBEDDING_PROVIDER_ERROR";
    this.details = options?.details;
  }
}

export type OllamaEmbeddingProviderOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  maxBatchSize?: number;
};

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id = "ollama";
  readonly maxBatchSize?: number;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: OllamaEmbeddingProviderOptions) {
    if (options.baseUrl.trim().length === 0) {
      throw new EmbeddingProviderError("Ollama provider requires a non-empty baseUrl", {
        code: "OLLAMA_BASE_URL_INVALID",
      });
    }

    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (options.maxBatchSize !== undefined) {
      this.maxBatchSize = options.maxBatchSize;
    }
  }

  async embed(request: EmbeddingProviderRequest): Promise<number[][]> {
    if (request.model.trim().length === 0) {
      throw new EmbeddingProviderError("Ollama provider requires a non-empty model", {
        code: "OLLAMA_MODEL_INVALID",
      });
    }
    if (request.inputs.length === 0) {
      throw new EmbeddingProviderError("Ollama provider requires at least one input", {
        code: "OLLAMA_INPUTS_EMPTY",
      });
    }

    const response = await this.fetchImpl(new URL("/api/embed", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        input: request.inputs.length === 1 ? request.inputs[0] : request.inputs,
      }),
    });

    if (!response.ok) {
      throw new EmbeddingProviderError(`Ollama embedding request failed with ${response.status}`, {
        code: "OLLAMA_REQUEST_FAILED",
        details: { status: response.status, statusText: response.statusText },
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new EmbeddingProviderError("Ollama embedding response must be valid JSON", {
        code: "OLLAMA_RESPONSE_INVALID_JSON",
        details: error instanceof Error ? { cause: error.message } : undefined,
      });
    }

    return validateEmbeddingResponse(payload, request.inputs.length);
  }
}

export function createEmbeddingProvidersFromEnvironment(env: NodeJS.ProcessEnv): EmbeddingProviderRegistry {
  const providers: EmbeddingProviderRegistry = {};
  const ollamaBaseUrl = env.HIVEMAP_OLLAMA_BASE_URL;
  if (ollamaBaseUrl !== undefined && ollamaBaseUrl.trim().length > 0) {
    providers.ollama = new OllamaEmbeddingProvider({ baseUrl: ollamaBaseUrl });
  }
  return providers;
}

function validateEmbeddingResponse(payload: unknown, expectedCount: number): number[][] {
  if (typeof payload !== "object" || payload === null || !("embeddings" in payload)) {
    throw new EmbeddingProviderError("Ollama embedding response must include embeddings", {
      code: "OLLAMA_RESPONSE_INVALID",
    });
  }

  const embeddings = (payload as { embeddings: unknown }).embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
    throw new EmbeddingProviderError("Ollama embedding response returned an unexpected embeddings count", {
      code: "OLLAMA_RESPONSE_COUNT_MISMATCH",
      details: { expectedCount },
    });
  }

  const vectors = embeddings.map((vector) => validateEmbeddingVector(vector));
  const dimensions = vectors[0]?.length ?? 0;
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new EmbeddingProviderError("Ollama embeddings must all have the same dimensions", {
        code: "OLLAMA_RESPONSE_DIMENSION_MISMATCH",
      });
    }
  }

  return vectors;
}

function validateEmbeddingVector(vector: unknown): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new EmbeddingProviderError("Ollama embedding vectors must be non-empty arrays", {
      code: "OLLAMA_VECTOR_INVALID",
    });
  }

  const values = vector.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new EmbeddingProviderError("Ollama embedding vectors must contain only finite numbers", {
        code: "OLLAMA_VECTOR_INVALID",
      });
    }
    return value;
  });

  return values;
}
