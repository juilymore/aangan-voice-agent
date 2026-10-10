import "server-only";
import type { LlmProvider } from "./types";

// Gemini REST generateContent with structured JSON output, temperature 0 (build_spec §8.5).
// Docs: https://ai.google.dev/api/generate-content
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 25_000,
  ) {}

  async generateJson({ system, untrusted, jsonSchema }: { system: string; untrusted: string; jsonSchema: object }) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: untrusted }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`gemini ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error("gemini: empty response");
    return text;
  }
}
