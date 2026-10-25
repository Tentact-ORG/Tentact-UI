import { errorMessage } from "../core/errors";
import { getLogger } from "../core/logger";
import { parseFencedJson, sqlGeneratorOutputSchema, type SQLGeneratorOutput } from "../schemas/agent";
import type { IntermediateSearchRepresentation } from "../schemas/search";
import { SQL_GENERATOR_SYSTEM_PROMPT } from "./agentPrompts";
import { llmAdapter } from "./llmAdapter";
import { relationshipService } from "./relationshipDiscovery";
import { schemaDiscoveryService } from "./schemaDiscovery";
import { valueDiscoveryService } from "./valueDiscovery";

const logger = getLogger("leadgen.sql_generator");

/** Agent 1: translates the intermediate representation into candidate ClickHouse SQL. */
class SQLGeneratorAgent {
  async generateSql(rep: IntermediateSearchRepresentation, naturalQuery: string | null): Promise<SQLGeneratorOutput> {
    const schema = schemaDiscoveryService.getCachedSchema();
    const approvedJoins = relationshipService.getApprovedRelationships();
    const cachedValues = valueDiscoveryService.getCachedValues();

    // Schema summary excluding unapproved tables and columns.
    const schemaLines: string[] = [];
    for (const [tbl, info] of Object.entries(schema)) {
      if (!info.is_approved) continue;
      const cols = Object.entries(info.columns)
        .filter(([, meta]) => meta.is_approved)
        .map(([name, meta]) => `${name} (${meta.type})`);
      const rowNote = tbl === "job_change" ? " [EMPTY - 0 ROWS - DO NOT QUERY]" : "";
      schemaLines.push(`Table ${tbl}${rowNote}: ${cols.join(", ")}`);
    }

    // A compact sample of verified categorical values to ground the model.
    const verifiedSampleValues: Record<string, unknown[]> = {};
    for (const [key, entry] of Object.entries(cachedValues).slice(0, 12)) {
      if (entry.strategy === "categorical_enum" && Array.isArray(entry.values)) {
        verifiedSampleValues[key] = entry.values.slice(0, 6);
      }
    }

    // Columns that value discovery measured as holding no data at all; filtering on them can only return zero rows.
    const emptyColumns = Object.entries(cachedValues)
      .filter(([, entry]) => entry.completeness === "complete" && entry.exact_count === 0 && schema[entry.table]?.is_approved)
      .map(([key]) => key);

    const userPrompt = `
Discovered ClickHouse Schema:
${schemaLines.join("\n")}

Approved Table Relationships:
${JSON.stringify(approvedJoins)}

Verified Distinct Values Sample:
${JSON.stringify(verifiedSampleValues)}

Empty Columns (no data, never filter on these):
${JSON.stringify(emptyColumns)}

User Search Request:
Natural Query: ${naturalQuery || "None provided"}
Intermediate Search Representation:
${JSON.stringify(rep)}

Generate the ClickHouse SQL and Count SQL in strict JSON format.
`;

    const responseText = await llmAdapter.generateCompletion(SQL_GENERATOR_SYSTEM_PROMPT, userPrompt);
    try {
      return sqlGeneratorOutputSchema.parse(parseFencedJson(responseText));
    } catch (err) {
      logger.error(`Failed to parse SQLGeneratorOutput: ${errorMessage(err)}. Raw text: ${responseText.slice(0, 2000)}`);
      throw new Error(`Generator output was malformed: ${errorMessage(err)}`);
    }
  }
}

export const sqlGeneratorAgent = new SQLGeneratorAgent();
