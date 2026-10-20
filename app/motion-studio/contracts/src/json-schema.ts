import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** JSON Schema для `claude --json-schema`: без $ref, у объектов additionalProperties=false. */
export function toJsonSchema(schema: ZodTypeAny): object {
  const json = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
    removeAdditionalStrategy: "strict",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
