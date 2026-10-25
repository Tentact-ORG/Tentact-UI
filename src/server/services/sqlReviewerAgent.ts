import { errorMessage } from "../core/errors";
import { getLogger } from "../core/logger";
import {
  parseFencedJson,
  sqlReviewerOutputSchema,
  type SQLGeneratorOutput,
  type SQLReviewerOutput,
} from "../schemas/agent";
import type { IntermediateSearchRepresentation } from "../schemas/search";
import { SQL_REVIEWER_SYSTEM_PROMPT } from "./agentPrompts";
import { llmAdapter } from "./llmAdapter";
import { relationshipService } from "./relationshipDiscovery";
import { schemaDiscoveryService } from "./schemaDiscovery";

const logger = getLogger("leadgen.sql_reviewer");

/** Agent 2: independently reviews generated SQL before anything is executed. */
class SQLReviewerAgent {
  async reviewSql(
    rep: IntermediateSearchRepresentation,
    genOutput: SQLGeneratorOutput,
    naturalQuery: string | null,
  ): Promise<SQLReviewerOutput> {
    const schema = schemaDiscoveryService.getCachedSchema();
    const approvedJoins = relationshipService.getApprovedRelationships();

    // Full column detail only for referenced or unapproved tables keeps the prompt bounded.
    const generatedSqlLower = (genOutput.clickhouse_sql || "").toLowerCase();
    const referencedTables = genOutput.target_tables.map((t) => t.toLowerCase());
    const schemaSummary: Record<string, unknown> = {};
    for (const [tbl, info] of Object.entries(schema)) {
      const tblLower = tbl.toLowerCase();
      const isReferenced = generatedSqlLower.includes(tblLower) || referencedTables.some((rt) => rt.includes(tblLower));
      if (isReferenced || !info.is_approved) {
        schemaSummary[tbl] = {
          is_approved: info.is_approved,
          columns: Object.fromEntries(
            Object.entries(info.columns).map(([name, meta]) => [
              name,
              `${meta.type} (approved=${meta.is_approved ? "True" : "False"})`,
            ]),
          ),
        };
      } else {
        schemaSummary[tbl] = { is_approved: info.is_approved, column_count: Object.keys(info.columns).length };
      }
    }

    const userPrompt = `
Discovered Schema Registry:
${JSON.stringify(schemaSummary)}

Approved Joins Registry:
${JSON.stringify(approvedJoins, null, 2)}

User Context:
Role: ${rep.user_role}
Natural Query: ${naturalQuery || "None provided"}
Intermediate Search Representation:
${JSON.stringify(rep, null, 2)}

Generated ClickHouse SQL:
${genOutput.clickhouse_sql}

Generated Count SQL:
${genOutput.count_sql ?? "None"}

Parameters:
${JSON.stringify(genOutput.parameters, null, 2)}

Generator Assumptions:
${JSON.stringify(genOutput.assumptions, null, 2)}

Evaluate the query and return your independent review verdict in strict JSON format.
`;

    const responseText = await llmAdapter.generateCompletion(SQL_REVIEWER_SYSTEM_PROMPT, userPrompt);
    try {
      return sqlReviewerOutputSchema.parse(parseFencedJson(responseText));
    } catch (err) {
      logger.error(`Failed to parse SQLReviewerOutput: ${errorMessage(err)}. Raw text: ${responseText.slice(0, 2000)}`);
      // Fail closed: an unparseable review is a rejection.
      return {
        verdict: "REJECTED",
        satisfies_request: false,
        schema_matched: false,
        joins_approved: false,
        security_passed: false,
        is_read_only: true,
        has_correct_grain: false,
        issues: ["Reviewer structured response parsing error"],
        reasoning: `Failed to parse reviewer structured output: ${errorMessage(err)}`,
        clarification_question: null,
      };
    }
  }
}

export const sqlReviewerAgent = new SQLReviewerAgent();
