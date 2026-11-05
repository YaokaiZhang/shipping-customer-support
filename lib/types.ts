export type Zone = "FI" | "NORDIC" | "EU" | "WORLD";

export interface Product {
  id: string;
  name: string;
  maxWeightKg: number;
  minWeightKg?: number;
  maxDimsCm: [number, number, number];
  zones: Zone[];
  speedDays: [number, number];
  co2PerKgKm: number;
  description: string;
}

export interface ShipmentProfile {
  item?: string;
  from: string;
  to?: string;
  zone?: Zone;
  weightKg?: number;
  dimsCm?: [number, number, number];
  fragile?: boolean;
  declaredValue?: number;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  suggested: boolean;
  reason?: string;
}

export type QuoteTag = "cheapest" | "fastest" | "greenest";

export interface Quote {
  id: string;
  productId: string;
  productName: string;
  price: number;
  currency: "EUR";
  etaDays: [number, number];
  co2Kg: number;
  addOns: AddOn[];
  inputs: ShipmentProfile;
  issuedAt: number;
  validUntil: number;
  tags: QuoteTag[];
}

export interface DimensionEstimate {
  imageUrl: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  estWeightKg: number;
  confidence: number;
  referenceObjectFound: string | null;
}

export interface Restriction {
  item: string;
  rule: "forbidden" | "allowed_with_product" | "needs_declaration" | "ok";
  productName?: string;
  note: string;
}

export interface SalesLead {
  id: string;
  company: string;
  volume: string;
  lanes: string[];
  needs: string[];
  summary: string;
  createdAt: number;
}

export interface Handoff {
  id: string;
  intent: string;
  reason: string;
  details: { label: string; value: string }[];
  quoteIds: string[];
  summary: string;
  createdAt: number;
}

export type GuardAction = "stripped" | "rephrased" | "handed_off" | "held" | "routed";

export interface GuardEvent {
  id: string;
  ruleId: string;
  action: GuardAction;
  excerpt: string;
  at: number;
}

export type Block =
  | { type: "quotes"; quoteIds: string[]; highlight?: string }
  | { type: "estimate"; estimate: DimensionEstimate; confirmed?: boolean }
  | { type: "restriction"; restriction: Restriction }
  | { type: "lead"; leadId: string }
  | { type: "handoff"; handoffId: string };

export interface Chip {
  label: string;
  action?: "demo-photo" | "upload";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text?: string;
  imageUrl?: string;
  blocks?: Block[];
  chips?: Chip[];
  guarded?: string[];
}

export interface Rule {
  id: string;
  short: string;
  text: string;
  type: string;
}

export interface StressTest {
  id: string;
  input: string;
  rules: string[];
}
