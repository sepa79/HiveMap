/**
 * Responsibility: Route authenticated REST and MCP requests into one shared HiveMapRuntime.
 * Must not: Reimplement domain semantics, persist state directly, or own process configuration.
 * Contract: All protected transports delegate to the same runtime instance and explicit boundary helpers.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  type ApplyGraphCommandsRequest,
  type ListSimilarConceptsRequest,
  type CreateProjectionRequest,
  type CreateProposalRequest,
  type CreateWorkspaceRequest,
  type ExecuteRepositoryIndexRequest,
  type GetRepositoryIndexRequest,
  type RecordFeedbackRequest,
  type CompleteScanRequest,
  type CreateScanFindingRequest,
  type ListRepositoryIndexesRequest,
  type RecordScanCalibrationDecisionRequest,
  type RecordScanCoverageRequest,
  type SearchRepositoryIndexRequest,
  type SuggestScanProfileOverlayRequest,
  type StartScanRequest,
  type StartRepositoryIndexRequest,
  type UpsertConceptEmbeddingRequest,
  type UpdateFindingRequest,
  type ValidateScanFindingRequest,
} from "@hivemap/api-contracts";
import { handleHiveMapMcpHttpRequest } from "@hivemap/mcp/http";
import { HiveMapRuntime, type RepositoryIndexExecutor } from "@hivemap/runtime";
import type { HiveMapStore } from "@hivemap/storage";

import {
  ApiHttpError,
  parseOptionalNumber,
  parseOptionalPositiveInteger,
  parseRequiredPositiveInteger,
  parseUrl,
  readJson,
  requireQueryParam,
  writeEmpty,
  writeError,
  writeJson,
  writeStatic,
} from "./http-boundary.js";
import { readStorageReadiness } from "./storage-readiness.js";
import { isPublicUiRequest, readStaticFile } from "./static-assets.js";

export type ApiServerOptions = {
  store: HiveMapStore;
  authToken: string;
  staticRoot?: string;
  repositoryIndexExecutor?: RepositoryIndexExecutor;
};

export type ApiRequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

export function createApiServer(options: ApiServerOptions): Server {
  return createServer(createApiRequestHandler(options));
}

export function createApiRequestHandler(options: ApiServerOptions): ApiRequestHandler {
  if (options.authToken.trim().length === 0) {
    throw new Error("HiveMap API requires a non-empty auth token");
  }
  const runtime = new HiveMapRuntime({
    store: options.store,
    repositorySourcePolicy: "remote-only",
    ...(options.repositoryIndexExecutor === undefined ? {} : { repositoryIndexExecutor: options.repositoryIndexExecutor }),
  });
  return (request, response) => {
    void handleRequest(runtime, options.store, options.authToken, options.staticRoot, request, response);
  };
}

async function handleRequest(
  runtime: HiveMapRuntime,
  store: HiveMapStore,
  authToken: string,
  staticRoot: string | undefined,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const method = request.method;
    const url = parseUrl(request);
    const pathname = url.pathname;
    const segments = pathname.split("/").filter(Boolean).map(decodePathSegment);

    if (method === "OPTIONS") {
      writeEmpty(response, 204);
      return;
    }

    if (method === "GET" && pathname === "/health") {
      const readiness = await readStorageReadiness(store);
      if (readiness.status === "unavailable") {
        writeStorageUnavailable(response);
        return;
      }
      writeJson(response, 200, readiness);
      return;
    }

    if (!isPublicUiRequest(method, pathname) && request.headers.authorization !== `Bearer ${authToken}`) {
      writeJson(response, 401, { error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      return;
    }

    if (pathname === "/mcp") {
      response.setHeader("access-control-allow-origin", "*");
      response.setHeader("access-control-expose-headers", "mcp-session-id");
      await handleHiveMapMcpHttpRequest(runtime, request, response);
      return;
    }

    if (method === "POST" && pathname === "/workspaces") {
      const body = await readJson<CreateWorkspaceRequest>(request);
      writeJson(response, 201, await runtime.createWorkspace(body));
      return;
    }

    if (method === "GET" && pathname === "/workspaces") {
      writeJson(response, 200, await runtime.listWorkspaces());
      return;
    }

    if (method === "GET" && staticRoot !== undefined && !pathname.startsWith("/workspaces")) {
      const file = await readStaticFile(staticRoot, pathname);
      if (file !== undefined) {
        writeStatic(response, file.contentType, file.bytes);
        return;
      }
    }

    if (segments[0] !== "workspaces" || segments[1] === undefined) {
      throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
    }

    const workspaceId = segments[1];

    if (method === "GET" && segments.length === 2) {
      writeJson(response, 200, await runtime.getWorkspace(workspaceId));
      return;
    }

    if (method === "GET" && segments[2] === "graph" && segments.length === 3) {
      writeJson(response, 200, await runtime.getGraph({ workspaceId }));
      return;
    }

    if (method === "GET" && segments[2] === "repository-indexes" && segments.length === 3) {
      const repositoryIndexRequest: ListRepositoryIndexesRequest = { workspaceId };
      writeJson(response, 200, await runtime.listRepositoryIndexes(repositoryIndexRequest));
      return;
    }

    if (method === "POST" && segments[2] === "repository-indexes" && segments.length === 3) {
      const body = await readJson<Omit<StartRepositoryIndexRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.startRepositoryIndex({ workspaceId, index: body.index }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "repository-indexes" &&
      segments[3] !== undefined &&
      segments[4] === "execute" &&
      segments.length === 5
    ) {
      const executeRequest: ExecuteRepositoryIndexRequest = { workspaceId, indexId: segments[3] };
      writeJson(response, 200, await runtime.executeRepositoryIndex(executeRequest));
      return;
    }

    if (method === "GET" && segments[2] === "repository-indexes" && segments[3] !== undefined && segments.length === 4) {
      const repositoryIndexRequest: GetRepositoryIndexRequest = { workspaceId, indexId: segments[3] };
      writeJson(response, 200, await runtime.getRepositoryIndex(repositoryIndexRequest));
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "repository-indexes" &&
      segments[3] !== undefined &&
      segments[4] === "search" &&
      segments.length === 5
    ) {
      const limit = parseOptionalPositiveInteger(url.searchParams.get("limit"), "limit");
      const searchRequest: SearchRepositoryIndexRequest = {
        workspaceId,
        indexId: segments[3],
        query: requireQueryParam(url, "query"),
        ...(limit === undefined ? {} : { limit }),
      };
      writeJson(response, 200, await runtime.searchRepositoryIndex(searchRequest));
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "repository-indexes" &&
      segments[3] !== undefined &&
      segments[4] === "evidence-candidates" &&
      segments.length === 5
    ) {
      const limit = parseOptionalPositiveInteger(url.searchParams.get("limit"), "limit");
      writeJson(
        response,
        200,
        await runtime.listRepositoryEvidenceCandidates({
          workspaceId,
          indexId: segments[3],
          profileId: requireQueryParam(url, "profileId"),
          profileVersion: parseRequiredPositiveInteger(url.searchParams.get("profileVersion"), "profileVersion"),
          criterionId: requireQueryParam(url, "criterionId"),
          ...(limit === undefined ? {} : { limit }),
        }),
      );
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "boundary-map" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.buildScanBoundaryMap({ workspaceId, scanId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "concepts" &&
      segments[3] !== undefined &&
      segments[4] === "embedding" &&
      segments.length === 5
    ) {
      const body = await readJson<{ embedding: UpsertConceptEmbeddingRequest["embedding"] }>(request);
      writeJson(response, 201, await runtime.upsertConceptEmbedding({ workspaceId, nodeId: segments[3], embedding: body.embedding }));
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "concepts" &&
      segments[3] !== undefined &&
      segments[4] === "similar" &&
      segments.length === 5
    ) {
      const limit = parseOptionalPositiveInteger(url.searchParams.get("limit"), "limit");
      const minScore = parseOptionalNumber(url.searchParams.get("minScore"), "minScore");
      const similarityRequest: ListSimilarConceptsRequest = {
        workspaceId,
        nodeId: segments[3],
        model: requireQueryParam(url, "model"),
        ...(limit === undefined ? {} : { limit }),
        ...(minScore === undefined ? {} : { minScore }),
      };
      writeJson(response, 200, await runtime.listSimilarConcepts(similarityRequest));
      return;
    }

    if (method === "POST" && segments[2] === "commands" && segments.length === 3) {
      const body = await readJson<Omit<ApplyGraphCommandsRequest, "workspaceId">>(request);
      writeJson(response, 200, await runtime.applyGraphCommands({ workspaceId, commands: body.commands }));
      return;
    }

    if (method === "GET" && segments[2] === "categories" && segments.length === 3) {
      writeJson(response, 200, await runtime.getCategories(workspaceId));
      return;
    }

    if (method === "POST" && segments[2] === "category-assignments" && segments.length === 3) {
      const body = await readJson<{ assignment: Parameters<HiveMapRuntime["assignCategory"]>[0]["assignment"] }>(request);
      writeJson(response, 201, await runtime.assignCategory({ workspaceId, assignment: body.assignment }));
      return;
    }

    if (method === "GET" && segments[2] === "projections" && segments[3] !== undefined && segments.length === 4) {
      writeJson(response, 200, await runtime.getProjection({ workspaceId, projectionId: segments[3] }));
      return;
    }

    if (method === "POST" && segments[2] === "projections" && segments.length === 3) {
      const body = await readJson<Omit<CreateProjectionRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.createProjection({ workspaceId, input: body.input }));
      return;
    }

    if (method === "GET" && segments[2] === "feedback" && segments.length === 3) {
      writeJson(response, 200, await runtime.listFeedback({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "feedback" && segments.length === 3) {
      const body = await readJson<Omit<RecordFeedbackRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.recordFeedback({ workspaceId, feedbackEvent: body.feedbackEvent }));
      return;
    }

    if (method === "GET" && segments[2] === "proposals" && segments.length === 3) {
      writeJson(response, 200, await runtime.listProposals({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "proposals" && segments.length === 3) {
      const body = await readJson<Omit<CreateProposalRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.createProposal({ workspaceId, proposal: body.proposal }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "proposals" &&
      segments[3] !== undefined &&
      segments[4] === "approve" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.approveProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "proposals" &&
      segments[3] !== undefined &&
      segments[4] === "apply" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.applyProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "proposals" &&
      segments[3] !== undefined &&
      segments[4] === "reject" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.rejectProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (method === "GET" && segments[2] === "scan-profiles" && segments.length === 3) {
      writeJson(response, 200, await runtime.listScanProfiles({ workspaceId }));
      return;
    }

    if (method === "GET" && segments[2] === "scans" && segments.length === 3) {
      writeJson(response, 200, await runtime.listScanRuns({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "scans" && segments.length === 3) {
      const body = await readJson<Omit<StartScanRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.startScan({ workspaceId, scan: body.scan }));
      return;
    }

    if (method === "DELETE" && segments[2] === "scans" && segments[3] !== undefined && segments.length === 4) {
      writeJson(response, 200, await runtime.deleteScan({ workspaceId, scanId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "calibration-decision" &&
      segments.length === 5
    ) {
      const body = await readJson<Omit<RecordScanCalibrationDecisionRequest, "workspaceId" | "scanId">>(request);
      writeJson(response, 200, await runtime.recordScanCalibrationDecision({ workspaceId, scanId: segments[3], ...body }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "overlay-suggestion" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<SuggestScanProfileOverlayRequest, "symptomId">>(request);
      writeJson(
        response,
        200,
        await runtime.suggestScanProfileOverlay({
          workspaceId,
          scanId: segments[3],
          symptomId: body.symptomId,
        }),
      );
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "coverage" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<RecordScanCoverageRequest, "coverage">>(request);
      writeJson(response, 200, await runtime.recordScanCoverage({ workspaceId, scanId: segments[3], coverage: body.coverage }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "finding-validation" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<ValidateScanFindingRequest, "criterionId" | "boundaryMap">>(request);
      writeJson(
        response,
        200,
        await runtime.validateScanFinding({
          workspaceId,
          scanId: segments[3],
          criterionId: body.criterionId,
          ...(body.boundaryMap === undefined ? {} : { boundaryMap: body.boundaryMap }),
        }),
      );
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "findings" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<CreateScanFindingRequest, "finding">>(request);
      writeJson(response, 201, await runtime.createScanFinding({ workspaceId, scanId: segments[3], finding: body.finding }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "complete" &&
      segments.length === 5
    ) {
      const body = await readJson<Omit<CompleteScanRequest, "workspaceId" | "scanId">>(request);
      writeJson(response, 200, await runtime.completeScan({ workspaceId, scanId: segments[3], ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "scan-comparisons" && segments.length === 3) {
      const body = await readJson<{ beforeScanId: string; afterScanId: string }>(request);
      writeJson(response, 200, await runtime.compareScans({ workspaceId, ...body }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "findings" &&
      segments[3] !== undefined &&
      segments[4] === "update" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<UpdateFindingRequest, "changes">>(request);
      writeJson(response, 200, await runtime.updateFinding({ workspaceId, findingNodeId: segments[3], changes: body.changes }));
      return;
    }

    throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
  } catch (error) {
    const readiness = await readStorageReadiness(store);
    if (readiness.status === "unavailable") {
      writeStorageUnavailable(response);
      return;
    }
    writeError(response, error);
  }
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new ApiHttpError(400, "INVALID_PATH_ENCODING", `Invalid percent-encoding in path segment: ${segment}`);
  }
}

function writeStorageUnavailable(response: ServerResponse): void {
  writeJson(response, 503, {
    error: {
      code: "STORAGE_UNAVAILABLE",
      message: "HiveMap storage is unavailable",
    },
  });
}
