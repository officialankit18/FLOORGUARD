import { pipeline, RawImage } from '@huggingface/transformers';

// COCO person detector. Load once and reuse for every floor candidate.
type Detection = { label: string; score: number };
type Detector = (image: RawImage, options: { threshold: number }) => Promise<Detection[]>;
let detectorPromise: Promise<Detector> | undefined;
let modelReady = false;
let modelLoading = false;
const loadPipeline = pipeline as unknown as (task: string, model: string, options: Record<string, string>) => Promise<Detector>;
const detector = () => detectorPromise ||= (modelLoading = true, loadPipeline('object-detection', 'Xenova/yolos-tiny', { dtype: 'q8', device: 'cpu' }).then(model => { modelReady = true; modelLoading = false; return model; }).catch(error => { modelReady = false; modelLoading = false; detectorPromise = undefined; throw error; }));
export function warmPersonDetector() { void detector().catch(error => console.warn('[Vision] Model unavailable:', (error as Error).message)); }
export function personDetectorStatus() { return modelReady ? 'Ready' : modelLoading ? 'Loading' : 'Unavailable'; }

export async function classifyFloorFrame(bytes: Buffer): Promise<{ category: 'person' | 'object' | 'uncertain'; score: number; labels: string[] }> {
  const model = await detector();
  const image = await RawImage.read(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
  const predictions = await model(image, { threshold: 0.35 });
  const people = predictions.filter(item => item.label.toLowerCase() === 'person');
  const score = Math.max(0, ...people.map(item => item.score));
  const objectScore = Math.max(0, ...predictions.filter(item => item.label.toLowerCase() !== 'person').map(item => item.score));
  return { category: score >= 0.55 ? 'person' : score < 0.25 && objectScore >= 0.55 ? 'object' : 'uncertain', score, labels: predictions.slice(0, 5).map(item => item.label) };
}
