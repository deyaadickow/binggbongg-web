// The person cut-out the web already uses for Green Screen (MediaPipe's selfie segmenter, model
// self-hosted, wasm pinned to the npm package version so the glue and the wasm always match).
// Loaded on demand only, so the rest of the site never pays for it.
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

export const SEGMENTER_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const SEGMENTER_MODEL_URL = "/models/selfie_segmenter.tflite";

/** A segmenter for still photos (IMAGE mode): GPU when the browser has it, else CPU. */
export async function loadImageSegmenter(): Promise<ImageSegmenter> {
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(SEGMENTER_WASM_BASE);
  const make = (delegate: "GPU" | "CPU") => ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL, delegate },
    runningMode: "IMAGE",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  return make("GPU").catch(() => make("CPU"));
}
