import { describe, expect, it } from "vitest";

import {
  CategoryValidationError,
  INITIAL_CATEGORY_CATALOG,
  createCategoryCatalog,
  validateCategoryAssignment,
  validateCategoryAssignments,
  validateCategoryCatalog,
  type CategoryAssignmentTargetIndex,
  type CategoryCatalog,
} from "./index.js";

const targets: CategoryAssignmentTargetIndex = {
  nodeIds: ["node-a"],
  edgeIds: ["edge-a"],
  projectionIds: ["projection-a"],
};

describe("category catalog", () => {
  it("contains the initial stable category ids", () => {
    expect(INITIAL_CATEGORY_CATALOG.categories.map((category) => category.id)).toEqual([
      "confirmed",
      "inferred",
      "critique",
      "risk",
      "learning",
      "unknown",
      "idea",
      "rule",
      "dependency",
      "experiment",
      "stale",
      "critical",
    ]);
  });

  it("validates the initial catalog", () => {
    expect(() => validateCategoryCatalog(INITIAL_CATEGORY_CATALOG)).not.toThrow();
  });

  it("creates an effective catalog with explicit project categories", () => {
    const catalog = createCategoryCatalog([
      {
        id: "project-priority",
        label: "Project Priority",
        description: "Project-specific priority marker.",
        source: "project",
      },
    ]);

    expect(catalog.categories.some((category) => category.id === "project-priority")).toBe(true);
  });

  it("rejects duplicate category ids", () => {
    const catalog: CategoryCatalog = {
      categories: [
        {
          id: "confirmed",
          label: "Confirmed",
          description: "Human-approved truth.",
          source: "system",
        },
        {
          id: "confirmed",
          label: "Duplicate",
          description: "Duplicate category.",
          source: "system",
        },
      ],
    };

    expect(() => validateCategoryCatalog(catalog)).toThrow(CategoryValidationError);
  });

  it("rejects project categories that collide with initial ids", () => {
    expect(() =>
      createCategoryCatalog([
        {
          id: "confirmed",
          label: "Confirmed",
          description: "Collision.",
          source: "project",
        },
      ]),
    ).toThrow(CategoryValidationError);
  });

  it("rejects empty category fields", () => {
    const catalog: CategoryCatalog = {
      categories: [
        {
          id: "custom",
          label: " ",
          description: "Custom category.",
          source: "project",
        },
      ],
    };

    expect(() => validateCategoryCatalog(catalog)).toThrow(CategoryValidationError);
  });
});

describe("category assignments", () => {
  it("validates node assignments against catalog and targets", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "node",
          targetId: "node-a",
          categoryId: "confirmed",
          status: "active",
          provenance: "human",
        },
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).not.toThrow();
  });

  it("validates edge assignments against catalog and targets", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "edge",
          targetId: "edge-a",
          categoryId: "risk",
          status: "active",
          provenance: "agent",
        },
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).not.toThrow();
  });

  it("validates projection assignments against catalog and targets", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "projection",
          targetId: "projection-a",
          categoryId: "unknown",
          status: "superseded",
          provenance: "system",
        },
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).not.toThrow();
  });

  it("rejects unknown category ids", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "node",
          targetId: "node-a",
          categoryId: "banana",
          status: "active",
          provenance: "human",
        },
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).toThrow(CategoryValidationError);
  });

  it("rejects unknown targets", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "node",
          targetId: "missing",
          categoryId: "confirmed",
          status: "active",
          provenance: "human",
        },
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).toThrow(CategoryValidationError);
  });

  it("rejects unknown target types", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "layout",
          targetId: "node-a",
          categoryId: "confirmed",
          status: "active",
          provenance: "human",
        } as never,
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).toThrow(CategoryValidationError);
  });

  it("rejects unknown statuses", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "node",
          targetId: "node-a",
          categoryId: "confirmed",
          status: "pending",
          provenance: "human",
        } as never,
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).toThrow(CategoryValidationError);
  });

  it("rejects unknown provenances", () => {
    expect(() =>
      validateCategoryAssignment(
        {
          id: "assignment-a",
          targetType: "node",
          targetId: "node-a",
          categoryId: "confirmed",
          status: "active",
          provenance: "model",
        } as never,
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).toThrow(CategoryValidationError);
  });

  it("rejects duplicate assignment ids", () => {
    expect(() =>
      validateCategoryAssignments(
        [
          {
            id: "assignment-a",
            targetType: "node",
            targetId: "node-a",
            categoryId: "confirmed",
            status: "active",
            provenance: "human",
          },
          {
            id: "assignment-a",
            targetType: "edge",
            targetId: "edge-a",
            categoryId: "risk",
            status: "active",
            provenance: "agent",
          },
        ],
        INITIAL_CATEGORY_CATALOG,
        targets,
      ),
    ).toThrow(CategoryValidationError);
  });
});
