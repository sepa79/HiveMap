const INITIAL_CATEGORY_IDS = [
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
] as const;

const CATEGORY_TARGET_TYPES = ["node", "edge", "projection"] as const;
const CATEGORY_ASSIGNMENT_STATUSES = ["active", "superseded"] as const;
const CATEGORY_PROVENANCES = ["human", "agent", "system"] as const;

export type InitialCategoryId = (typeof INITIAL_CATEGORY_IDS)[number];
export type CategoryTargetType = (typeof CATEGORY_TARGET_TYPES)[number];
export type CategoryAssignmentStatus = (typeof CATEGORY_ASSIGNMENT_STATUSES)[number];
export type CategoryProvenance = (typeof CATEGORY_PROVENANCES)[number];

export type CategoryDefinition = {
  id: string;
  label: string;
  description: string;
  source: "system" | "project";
};

export type CategoryAssignment = {
  id: string;
  targetType: CategoryTargetType;
  targetId: string;
  categoryId: string;
  status: CategoryAssignmentStatus;
  provenance: CategoryProvenance;
  notes?: string;
};

export type CategoryCatalog = {
  categories: CategoryDefinition[];
};

export type CategoryAssignmentTargetIndex = {
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  projectionIds: readonly string[];
};

export class CategoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryValidationError";
  }
}

export const INITIAL_CATEGORY_CATALOG: CategoryCatalog = {
  categories: [
    {
      id: "confirmed",
      label: "Confirmed",
      description: "Human-approved truth.",
      source: "system",
    },
    {
      id: "inferred",
      label: "Inferred",
      description: "AI inference or speculative interpretation.",
      source: "system",
    },
    {
      id: "critique",
      label: "Critique",
      description: "Critique, contradiction, or skepticism.",
      source: "system",
    },
    {
      id: "risk",
      label: "Risk",
      description: "Known risk, dangerous shortcut, or technical debt.",
      source: "system",
    },
    {
      id: "learning",
      label: "Learning",
      description: "Reusable learning or organizational knowledge.",
      source: "system",
    },
    {
      id: "unknown",
      label: "Unknown",
      description: "Ambiguity, missing evidence, or unclear ownership.",
      source: "system",
    },
    {
      id: "idea",
      label: "Idea",
      description: "New idea or emerging concept.",
      source: "system",
    },
    {
      id: "rule",
      label: "Rule",
      description: "Governance, mandatory constraint, or architecture standard.",
      source: "system",
    },
    {
      id: "dependency",
      label: "Dependency",
      description: "Cross-system dependency or shared context.",
      source: "system",
    },
    {
      id: "experiment",
      label: "Experiment",
      description: "Experimental feature, unsafe prototype, or operational test.",
      source: "system",
    },
    {
      id: "stale",
      label: "Stale",
      description: "Stale concept or abandoned direction.",
      source: "system",
    },
    {
      id: "critical",
      label: "Critical",
      description: "Critical alert, rule failure, or major drift.",
      source: "system",
    },
  ],
};

const INITIAL_CATEGORY_ID_SET: ReadonlySet<string> = new Set(INITIAL_CATEGORY_IDS);
const TARGET_TYPE_SET: ReadonlySet<string> = new Set(CATEGORY_TARGET_TYPES);
const STATUS_SET: ReadonlySet<string> = new Set(CATEGORY_ASSIGNMENT_STATUSES);
const PROVENANCE_SET: ReadonlySet<string> = new Set(CATEGORY_PROVENANCES);

export function createCategoryCatalog(projectCategories: readonly CategoryDefinition[] = []): CategoryCatalog {
  validateProjectCategories(projectCategories);
  const catalog = {
    categories: [...INITIAL_CATEGORY_CATALOG.categories, ...projectCategories],
  };

  validateCategoryCatalog(catalog);
  return catalog;
}

export function validateCategoryCatalog(catalog: CategoryCatalog): void {
  const ids = new Set<string>();

  for (const category of catalog.categories) {
    validateCategoryDefinition(category);

    if (ids.has(category.id)) {
      throw new CategoryValidationError(`Duplicate category id: ${category.id}`);
    }

    ids.add(category.id);
  }
}

export function validateCategoryAssignment(
  assignment: CategoryAssignment,
  catalog: CategoryCatalog,
  targets: CategoryAssignmentTargetIndex,
): void {
  validateCategoryCatalog(catalog);
  validateCategoryAssignmentShape(assignment);

  const categoryIds = new Set(catalog.categories.map((category) => category.id));
  if (!categoryIds.has(assignment.categoryId)) {
    throw new CategoryValidationError(`Unknown category id: ${assignment.categoryId}`);
  }

  const targetIds = getTargetIds(assignment.targetType, targets);
  if (!targetIds.has(assignment.targetId)) {
    throw new CategoryValidationError(`Unknown ${assignment.targetType} target id: ${assignment.targetId}`);
  }
}

export function validateCategoryAssignments(
  assignments: readonly CategoryAssignment[],
  catalog: CategoryCatalog,
  targets: CategoryAssignmentTargetIndex,
): void {
  const ids = new Set<string>();

  for (const assignment of assignments) {
    validateCategoryAssignment(assignment, catalog, targets);

    if (ids.has(assignment.id)) {
      throw new CategoryValidationError(`Duplicate category assignment id: ${assignment.id}`);
    }

    ids.add(assignment.id);
  }
}

function validateProjectCategories(projectCategories: readonly CategoryDefinition[]): void {
  for (const category of projectCategories) {
    if (category.source !== "project") {
      throw new CategoryValidationError(`Custom category ${category.id} must use source "project"`);
    }

    if (INITIAL_CATEGORY_ID_SET.has(category.id)) {
      throw new CategoryValidationError(`Custom category collides with initial category id: ${category.id}`);
    }
  }
}

function validateCategoryDefinition(category: CategoryDefinition): void {
  assertNonEmpty("category.id", category.id);
  assertNonEmpty("category.label", category.label);
  assertNonEmpty("category.description", category.description);

  if (category.source !== "system" && category.source !== "project") {
    throw new CategoryValidationError(`Unknown category source: ${category.source}`);
  }
}

function validateCategoryAssignmentShape(assignment: CategoryAssignment): void {
  assertNonEmpty("assignment.id", assignment.id);
  assertNonEmpty("assignment.targetId", assignment.targetId);
  assertNonEmpty("assignment.categoryId", assignment.categoryId);

  if (!TARGET_TYPE_SET.has(assignment.targetType)) {
    throw new CategoryValidationError(`Unknown category target type: ${assignment.targetType}`);
  }

  if (!STATUS_SET.has(assignment.status)) {
    throw new CategoryValidationError(`Unknown category assignment status: ${assignment.status}`);
  }

  if (!PROVENANCE_SET.has(assignment.provenance)) {
    throw new CategoryValidationError(`Unknown category provenance: ${assignment.provenance}`);
  }
}

function getTargetIds(targetType: CategoryTargetType, targets: CategoryAssignmentTargetIndex): ReadonlySet<string> {
  switch (targetType) {
    case "node":
      return new Set(targets.nodeIds);
    case "edge":
      return new Set(targets.edgeIds);
    case "projection":
      return new Set(targets.projectionIds);
  }
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new CategoryValidationError(`${fieldName} must be non-empty`);
  }
}
