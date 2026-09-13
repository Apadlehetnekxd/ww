export type Region = { x: number; y: number; width: number; height: number };
export type Point2 = { x: number; y: number };
export type PointingRay = { origin: Point2; direction: Point2 };
export type VisionObject = {
  id: string;
  type: string;
  label: string;
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  observations: number;
  region: Region;
};
export type ScanMetrics = {
  scanConfidence: number;
  sceneCoverage: number;
  viewpointCoverage: number;
  featureStability: number;
  objectCoverage: number;
  progress: number;
  complete: boolean;
  instruction: string;
  stablePoints: number;
};
export type RecognitionFrame = { objects: VisionObject[]; pointing: PointingRay | null; selectedId: string | null; hand?: Point2[] | null };
export type VisionTurn = { role: 'user' | 'assistant'; content: string };
export type VisionAnswer = { answer: string; needsMoreInfo?: string; searchQuery?: string };
export type VisionQuestion = {
  question: string;
  image: string;
  selectedObject: VisionObject | null;
  visibleObjects: VisionObject[];
  pointingObject: VisionObject | null;
  history: VisionTurn[];
  signal?: AbortSignal;
};
