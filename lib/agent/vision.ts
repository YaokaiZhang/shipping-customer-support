import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { DimensionEstimate } from "../types";
import { structured } from "./llm";

const SCHEMA = {
  type: "object",
  properties: {
    lengthCm: { type: "number" },
    widthCm: { type: "number" },
    heightCm: { type: "number" },
    estWeightKg: { type: "number" },
    confidence: { type: "number", description: "0 to 1" },
    referenceObjectFound: { type: ["string", "null"], description: "'A4 sheet', 'bank card', or null" },
  },
  required: ["lengthCm", "widthCm", "heightCm", "estWeightKg", "confidence", "referenceObjectFound"],
  additionalProperties: false,
};

const SYSTEM = `You measure items for parcel shipping from a single photo.
Look for a reference object: an A4 sheet (21.0 × 29.7 cm) or a bank card (8.56 × 5.40 cm). Use it to scale, correcting for perspective.
Return the item's own bounding box in centimetres (length ≥ width; height is vertical), rounded to whole cm, and its likely weight in kg from material and size.
confidence is how sure you are of the dimensions (0–1): above 0.8 only with a clear reference object and an unobstructed view; below 0.6 without a reference object.`;

type Media = Anthropic.Base64ImageSource["media_type"];

async function load(imageUrl: string): Promise<{ data: string; media: Media }> {
  const m = imageUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (m) return { media: m[1] as Media, data: m[2] };
  // Seeded demo photos only: a path under /public/demo.
  const rel = normalize(imageUrl).replace(/^\/+/, "");
  if (!rel.startsWith("demo/")) throw new Error("Unsupported image source.");
  const buf = await readFile(join(process.cwd(), "public", rel));
  return { media: rel.endsWith(".png") ? "image/png" : "image/jpeg", data: buf.toString("base64") };
}

/** Vision call with a strict JSON schema. The UI always shows the result as editable. */
export async function estimateDimensions(imageUrl: string): Promise<DimensionEstimate> {
  const img = await load(imageUrl);
  const e = await structured<Omit<DimensionEstimate, "imageUrl">>({
    system: SYSTEM,
    schema: SCHEMA,
    content: [
      { type: "image", source: { type: "base64", media_type: img.media, data: img.data } },
      { type: "text", text: "Measure the item to be shipped." },
    ],
  });
  const cm = (n: number) => Math.max(1, Math.round(n));
  return {
    imageUrl: imageUrl.startsWith("data:") ? "" : imageUrl, // the client keeps its own preview URL
    lengthCm: cm(e.lengthCm),
    widthCm: cm(e.widthCm),
    heightCm: cm(e.heightCm),
    estWeightKg: Math.max(0.1, Math.round(e.estWeightKg * 10) / 10),
    confidence: Math.min(1, Math.max(0, e.confidence)),
    referenceObjectFound: e.referenceObjectFound || null,
  };
}
