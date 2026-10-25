import { errorMessage, PolicyViolationError } from "../core/errors";
import { getLogger } from "../core/logger";
import { UserRole } from "../models/entities";
import type { SQLGeneratorOutput, SQLReviewerOutput } from "../schemas/agent";
import type {
  IntermediateSearchRepresentation,
  SearchDiagnostic,
  SearchRequest,
  SearchResultResponse,
  StructuredFilter,
} from "../schemas/search";
import { auditService } from "./auditService";
import { queryExecutor } from "./queryExecutor";
import { sqlGeneratorAgent } from "./sqlGeneratorAgent";
import { sqlReviewerAgent } from "./sqlReviewerAgent";
import { sqlValidator } from "./sqlValidator";
import { valueDiscoveryService } from "./valueDiscovery";

const logger = getLogger("leadgen.search_orchestrator");

const EMPLOYEE_RANGES: Array<[number, number, string]> = [
  [1, 10, "1 to 10"],
  [11, 50, "11 to 50"],
  [51, 200, "51 to 200"],
  [201, 500, "201 to 500"],
  [501, 1000, "501 to 1000"],
  [1001, 5000, "1001 to 5000"],
  [5001, 10000, "5001 to 10000"],
  [10001, Infinity, "10001+"],
];

const REVENUE_RANGES: Array<[number, number, string]> = [
  [0, 1_000_000, "<$1M"],
  [1_000_000, 10_000_000, "$1M to <$10M"],
  [10_000_000, 50_000_000, "$10M to <$50M"],
  [50_000_000, 100_000_000, "$50M to <$100M"],
  [100_000_000, 1_000_000_000, "$100M to <$1B"],
  [1_000_000_000, Infinity, "$1B+"],
];

const AMBIGUOUS_QUERIES = new Set(["all leads", "find leads", "leads", "search leads"]);

/** Labels of the discrete ranges overlapping [min, max]. */
function overlappingRanges(ranges: Array<[number, number, string]>, min: number, max: number): string[] {
  return ranges.filter(([low, high]) => high >= min && low <= max).map(([, , label]) => label);
}

const elapsedMs = (start: number) => performance.now() - start;

class SearchOrchestrationWorkflow {
  readonly maxRepairs = 2;

  /**
   * Translates a raw search request into a typed intermediate representation,
   * normalizing values against the discovered value cache.
   */
  buildIntermediateRepresentation(request: SearchRequest, userRole: string = UserRole.MEMBER): IntermediateSearchRepresentation {
    const filters: StructuredFilter[] = [];
    const normalizedValues: Record<string, unknown> = {};
    let clarificationNeeded = false;
    let clarificationPrompt: string | null = null;

    const icp = request.structured_icp;
    if (icp) {
      if (icp.industry && icp.industry.length > 0) {
        const values = icp.industry.map((v) => valueDiscoveryService.normalizeValue("synthetic_companies.industry", v) ?? v);
        filters.push({ field: "industry", operator: "in", value: values });
        normalizedValues.industry = values;
      }
      if (icp.country && icp.country.length > 0) {
        const values = icp.country.map((v) => valueDiscoveryService.normalizeValue("synthetic_companies.country", v) ?? v);
        filters.push({ field: "country", operator: "in", value: values });
        normalizedValues.country = values;
      }
      if (icp.min_employees !== null || icp.max_employees !== null) {
        const ranges = overlappingRanges(EMPLOYEE_RANGES, icp.min_employees ?? 1, icp.max_employees ?? Infinity);
        if (ranges.length > 0) {
          filters.push({ field: "EMPLOYEE_COUNT_RANGE_ORG", operator: "in", value: ranges });
          normalizedValues.EMPLOYEE_COUNT_RANGE_ORG = ranges;
        }
      }
      if (icp.min_revenue !== null || icp.max_revenue !== null) {
        const ranges = overlappingRanges(REVENUE_RANGES, icp.min_revenue ?? 0, icp.max_revenue ?? Infinity);
        if (ranges.length > 0) {
          filters.push({ field: "REVENUE_RANGE_ORG", operator: "in", value: ranges });
          normalizedValues.REVENUE_RANGE_ORG = ranges;
        }
      }
      for (const tech of icp.technologies ?? []) {
        filters.push({ field: "technologies", operator: "has", value: tech });
      }
      if (icp.job_title) filters.push({ field: "job_title", operator: "contains", value: icp.job_title });
      if (icp.email) filters.push({ field: "work_email", operator: "eq", value: icp.email });
      if (icp.additional_filters && icp.additional_filters.length > 0) filters.push(...icp.additional_filters);
    }

    const nq = (request.natural_query ?? "").trim().toLowerCase();
    if (AMBIGUOUS_QUERIES.has(nq)) {
      clarificationNeeded = true;
      clarificationPrompt =
        "Your search query 'leads' is ambiguous. Please specify whether you are searching for Companies or Contacts, or provide specific filters.";
    }

    const isCompany = request.search_target === "company";
    return {
      search_target: request.search_target,
      filters,
      normalized_values: normalizedValues,
      relevant_columns: [],
      required_entity_identifiers: isCompany ? ["company_id", "RBID_ORG"] : ["contact_id", "RBID_PER"],
      requested_output_fields: [],
      sorting_field: request.sort_by,
      sorting_dir: request.sort_dir || "DESC",
      page: request.page,
      page_size: request.page_size,
      ambiguities: [],
      clarification_needed: clarificationNeeded,
      clarification_prompt: clarificationPrompt,
      assumptions: [],
      user_role: userRole,
    };
  }

  private clarificationResponse(
    rep: IntermediateSearchRepresentation,
    start: number,
    assumptions: string[],
    message: string | null,
    diagnostic: SearchDiagnostic | null = null,
  ): SearchResultResponse {
    return {
      search_target: rep.search_target,
      total_distinct_count: 0,
      exact_count: true,
      page: rep.page,
      page_size: rep.page_size,
      total_pages: 0,
      records: [],
      applied_assumptions: assumptions,
      applied_filters: rep.filters,
      clarification_required: true,
      clarification_message: message,
      execution_time_ms: elapsedMs(start),
      diagnostic,
    };
  }

  async executeSearchFlow(
    request: SearchRequest,
    userRole: string,
    userId: number | null = null,
    orgId: number | null = null,
  ): Promise<SearchResultResponse> {
    const start = performance.now();
    const rep = this.buildIntermediateRepresentation(request, userRole);
    const isAdmin = userRole === UserRole.ADMIN;

    if (rep.clarification_needed) {
      return this.clarificationResponse(rep, start, rep.assumptions, rep.clarification_prompt);
    }

    let repairAttempts = 0;
    let lastErrorContext: string | null = null;

    while (repairAttempts <= this.maxRepairs) {
      // 1. SQL Generator Agent
      const genOutput: SQLGeneratorOutput = await sqlGeneratorAgent.generateSql(rep, request.natural_query);
      if (genOutput.unresolved_ambiguities.length > 0) {
        return this.clarificationResponse(rep, start, genOutput.assumptions, genOutput.unresolved_ambiguities.join("; "));
      }

      // 2. Independent SQL Reviewer Agent
      const review: SQLReviewerOutput = await sqlReviewerAgent.reviewSql(rep, genOutput, request.natural_query);

      if (review.verdict === "CLARIFICATION_REQUIRED") {
        const question = review.clarification_question || review.reasoning;
        logger.warn(
          `[SEARCH ORCHESTRATOR] CLARIFICATION REQUIRED (Reviewer Halted Execution): ${question}` +
            (review.issues.length > 0 ? ` | Issues: ${review.issues.join("; ")}` : ""),
        );
        const diagnostic: SearchDiagnostic | null = isAdmin
          ? {
              generated_sql: genOutput.clickhouse_sql,
              parameters: genOutput.parameters,
              reviewer_verdict: review.verdict,
              reviewer_reasoning: review.reasoning,
              validation_status: "SKIPPED",
              repair_attempts: 0,
              query_duration_ms: 0,
            }
          : null;
        return this.clarificationResponse(rep, start, genOutput.assumptions, question, diagnostic);
      }

      if (review.verdict === "REJECTED") {
        logger.warn(
          `[SEARCH ORCHESTRATOR] SQL REVIEWER REJECTED QUERY: ${review.issues.join("; ")} | ` +
            `Reasoning: ${review.reasoning}\nSQL: ${genOutput.clickhouse_sql}`,
        );
        // Security/policy/authorization failures are never retried.
        if (!review.security_passed || !review.joins_approved) {
          throw new PolicyViolationError(`Query rejected by security review: ${review.issues.join("; ")}`);
        }
        repairAttempts += 1;
        lastErrorContext = `Reviewer rejected: ${review.issues.join("; ")}`;
        continue;
      }

      // 3. Deterministic SQL validation
      const validation = sqlValidator.validateSql(genOutput.clickhouse_sql, userRole, false, 100);
      if (!validation.valid) {
        logger.warn(`[SEARCH ORCHESTRATOR] DETERMINISTIC SQL VALIDATOR FAILED: ${validation.violations.join("; ")}`);
        if (validation.violations.some((v) => v.includes("Access denied") || v.includes("Forbidden") || v.includes("Unapproved"))) {
          throw new PolicyViolationError(`Deterministic policy violation: ${validation.violations.join("; ")}`);
        }
        repairAttempts += 1;
        lastErrorContext = `SQL Validator failed: ${validation.violations.join("; ")}`;
        continue;
      }

      // 4. Controlled execution
      try {
        const exec = await queryExecutor.executeSearchQuery(genOutput.clickhouse_sql, genOutput.count_sql, genOutput.parameters);
        const totalPages = exec.total_count > 0 ? Math.ceil(exec.total_count / rep.page_size) : 1;
        const diagnostic: SearchDiagnostic | null = isAdmin
          ? {
              generated_sql: genOutput.clickhouse_sql,
              parameters: genOutput.parameters,
              reviewer_verdict: review.verdict,
              reviewer_reasoning: review.reasoning,
              validation_status: "PASSED",
              repair_attempts: repairAttempts,
              query_duration_ms: exec.duration_ms,
            }
          : null;

        await auditService.logEvent({
          action: "EXECUTE_SEARCH",
          resource: `leadgen.${rep.search_target}`,
          status: "SUCCESS",
          durationMs: Math.trunc(elapsedMs(start)),
          orgId,
          userId,
          details: {
            target: rep.search_target,
            total_count: exec.total_count,
            rows_returned: exec.records.length,
            repair_attempts: repairAttempts,
          },
        });

        return {
          search_target: rep.search_target,
          total_distinct_count: exec.total_count,
          exact_count: exec.exact_count,
          page: rep.page,
          page_size: rep.page_size,
          total_pages: totalPages,
          records: exec.records,
          applied_assumptions: genOutput.assumptions,
          applied_filters: rep.filters,
          clarification_required: false,
          clarification_message: null,
          execution_time_ms: elapsedMs(start),
          diagnostic,
        };
      } catch (err) {
        logger.warn(`ClickHouse execution error on attempt ${repairAttempts}: ${errorMessage(err)}`);
        repairAttempts += 1;
        lastErrorContext = `ClickHouse database error: ${errorMessage(err)}`;
      }
    }

    throw new Error(
      `Search query failed after ${this.maxRepairs} bounded repair attempts. Last error: ${lastErrorContext}`,
    );
  }
}

export const searchOrchestrator = new SearchOrchestrationWorkflow();
