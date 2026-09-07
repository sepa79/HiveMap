/**
 * Responsibility: Resolve boundary-map discovery configuration from a validated scan profile overlay.
 * Must not: Read repository files, construct boundary artifacts, validate artifacts, or mutate profiles.
 * Contract: Implements boundary-map configuration in docs/specs/repository-scan.md.
 */
import {
  parseBoundaryRootRule,
  serializeBoundaryRootRule,
  type BoundaryMapBuildConfig,
} from "./boundary-map-contract.js";
import { validateScanProfileOverlay, type ScanProfileOverlay } from "./scan-profile-overlay.js";

const DEFAULT_BOUNDARY_MAP_BUILD_CONFIG: BoundaryMapBuildConfig = {
  roots: [
    { pathPrefix: "apps", kind: "surface" },
    { pathPrefix: "packages", kind: "package" },
    { pathPrefix: "services", kind: "service" },
    { pathPrefix: "libs", kind: "library" },
    { pathPrefix: "libraries", kind: "library" },
    { pathPrefix: "modules", kind: "module" },
    { pathPrefix: "components", kind: "module" },
    { pathPrefix: "features", kind: "module" },
    { pathPrefix: "domains", kind: "module" },
    { pathPrefix: "src", kind: "module" },
    { pathPrefix: "source", kind: "module" },
    { pathPrefix: "tests", kind: "test-suite" },
    { pathPrefix: "test", kind: "test-suite" },
    { pathPrefix: "spec", kind: "test-suite" },
    { pathPrefix: "specs", kind: "test-suite" },
    { pathPrefix: "e2e", kind: "test-suite" },
    { pathPrefix: "integration", kind: "test-suite" },
    { pathPrefix: "tools", kind: "tool" },
    { pathPrefix: "tooling", kind: "tool" },
    { pathPrefix: "scripts", kind: "tool" },
    { pathPrefix: "bin", kind: "tool" },
    { pathPrefix: "cli", kind: "tool" },
  ],
  contractPathMarkers: ["/contracts/", "/spec/", "/specs/", "/schema/", "/schemas/", "/api/"],
  contractFileStems: ["readme", "contract", "contracts", "spec", "specs", "schema", "schemas", "api", "openapi"],
  ignoredDocTokens: [
    "src",
    "source",
    "lib",
    "libs",
    "libraries",
    "app",
    "apps",
    "service",
    "services",
    "package",
    "packages",
    "module",
    "modules",
    "feature",
    "features",
    "component",
    "components",
    "domain",
    "domains",
    "docs",
    "doc",
    "test",
    "tests",
    "spec",
    "specs",
    "readme",
  ],
  testDirectoryNames: ["test", "tests", "spec", "specs", "e2e", "integration"],
  routePathMarkers: ["/routes/", "/route/"],
  routeNameSuffixes: ["route", "router"],
  apiPathMarkers: ["/api/", "/endpoint/"],
  apiNameSuffixes: ["api", "endpoint", "controller", "handler"],
};

export function createBoundaryMapBuildConfig(overlay?: ScanProfileOverlay): BoundaryMapBuildConfig {
  if (overlay !== undefined) validateScanProfileOverlay(overlay);
  const rootRules = overlay?.boundaryMapRoots ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.roots.map(serializeBoundaryRootRule);
  return {
    roots: rootRules.map((value) => parseBoundaryRootRule(value)),
    contractPathMarkers: [...(overlay?.boundaryMapContractPathMarkers ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.contractPathMarkers)],
    contractFileStems: [...(overlay?.boundaryMapContractFileStems ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.contractFileStems)].map(
      (value) => value.toLowerCase(),
    ),
    ignoredDocTokens: [...(overlay?.boundaryMapIgnoredTokens ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.ignoredDocTokens)].map((value) =>
      value.toLowerCase(),
    ),
    testDirectoryNames: [...(overlay?.boundaryMapTestDirectoryNames ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.testDirectoryNames)].map(
      (value) => value.toLowerCase(),
    ),
    routePathMarkers: [...(overlay?.boundaryMapRoutePathMarkers ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.routePathMarkers)].map(
      (value) => value.toLowerCase(),
    ),
    routeNameSuffixes: [...(overlay?.boundaryMapRouteNameSuffixes ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.routeNameSuffixes)].map(
      (value) => value.toLowerCase(),
    ),
    apiPathMarkers: [...(overlay?.boundaryMapApiPathMarkers ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.apiPathMarkers)].map((value) =>
      value.toLowerCase(),
    ),
    apiNameSuffixes: [...(overlay?.boundaryMapApiNameSuffixes ?? DEFAULT_BOUNDARY_MAP_BUILD_CONFIG.apiNameSuffixes)].map((value) =>
      value.toLowerCase(),
    ),
  };
}
