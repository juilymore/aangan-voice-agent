// AI interface — build_spec.md §8.5 and §8.8. Gemini extracts and writes; it never decides.
// The extraction schema itself is defined at Checkpoint 3 (lib/pipeline/extraction-schema.ts).

export interface LlmProvider {
  readonly name: string;
  /**
   * Structured JSON generation at temperature 0. `system` holds instructions; `untrusted` is the
   * redacted transcript, placed inside delimiters by the implementation. Returns raw text; callers
   * validate with zod and retry once on failure.
   */
  generateJson(args: { system: string; untrusted: string; jsonSchema: object }): Promise<string>;
}

/** Returns canned responses keyed by a substring of the untrusted text, for deterministic tests. */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  responses: { match: string; json: string }[] = [];
  fallback: string | ((untrusted: string) => string) = "{}";

  async generateJson({ untrusted }: { system: string; untrusted: string; jsonSchema: object }) {
    const hit = this.responses.find((r) => untrusted.includes(r.match));
    if (hit) return hit.json;
    return typeof this.fallback === "function" ? this.fallback(untrusted) : this.fallback;
  }
}
