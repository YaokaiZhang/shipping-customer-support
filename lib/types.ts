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
  /** NordParcel packaging chosen on the photo estimate (data/packaging.json ids); added to quotes as AddOns. */
  packagingIds?: string[];
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
  /** What the item is, from the photo, e.g. "glass vase". */
  itemLabel?: string;
  /** Visible contents / hazard cues, e.g. "lithium battery pack", "glass", "liquid". */
  cues?: string[];
  fragile?: boolean;
  /** Already in a box (true) or unpacked (false). */
  packed?: boolean;
  /** Deterministic matchRestriction() result for itemLabel + cues; null when nothing matched. */
  restriction?: Restriction | null;
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
  /** Indicative monthly volume estimate at list prices (volume_quote), for the sales rep. */
  volumeQuote?: VolumeQuote;
}

/** One destination lane of a business volume estimate. All money is at LIST prices (G-3). */
export interface VolumeLane {
  zone: Zone;
  label: string;
  share: number; // 0..1
  parcelsPerMonth: number;
  productId: string;
  productName: string;
  listPricePerParcel: number;
  monthlyList: number;
  co2KgPerMonth: number;
  etaDays: [number, number];
}

/** Indicative monthly cost at list prices. Never discounted: sales prepares contract pricing. */
export interface VolumeQuote {
  id: string;
  parcelsPerMonth: number;
  avgWeightKg: number;
  lanes: VolumeLane[];
  monthlyListTotal: number;
  avgPerParcel: number;
  co2KgPerMonth: number;
  currency: "EUR";
  leadId?: string;
  issuedAt: number;
  /** Typical parcel size, once known; `options` then lists every product it fits, priced per month. */
  dimsCm?: [number, number, number];
  options?: VolumeOption[];
}

/** One product priced for the whole monthly volume (all lanes), at list prices. */
export interface VolumeOption {
  productId: string;
  productName: string;
  monthlyList: number;
  co2KgPerMonth: number;
  etaDays: [number, number];
}

export type HandoffUrgency = "low" | "normal" | "high";

export interface Handoff {
  id: string;
  intent: string;
  reason: string;
  details: { label: string; value: string }[];
  quoteIds: string[];
  summary: string;
  createdAt: number;
  /** Chat the handoff came from (set by the server or the client store). */
  chatId?: string;
  /** Snapshot of the shipment profile at handover. */
  shipment?: ShipmentProfile;
  /** Quotes shown in this chat, filled deterministically from turn state (never by the model). */
  quotesTried?: { id: string; productName: string }[];
  urgency?: HandoffUrgency;
  sentiment?: string;
  /** Reply the human agent can send as-is (price-guarded). */
  draftReply?: string;
  status?: "open" | "sent";
}

export type GuardAction = "stripped" | "rephrased" | "handed_off" | "held" | "routed";

export interface GuardEvent {
  id: string;
  ruleId: string;
  action: GuardAction;
  excerpt: string;
  at: number;
}

/** A live operations rule written by staff in the Guidelines tab (O-1, O-2, ...). */
export interface OpsRule {
  id: string;
  text: string;
  enabled: boolean;
}

/** A customer question the guidelines and products don't cover (log_knowledge_gap). */
export interface KnowledgeGap {
  id: string;
  topic: string;
  question: string;
  at: number;
}

export type Block =
  | { type: "quotes"; quoteIds: string[]; highlight?: string }
  | { type: "booking-form"; quoteId: string }
  | { type: "label"; booking: Booking }
  | { type: "tracking"; tracking: Tracking }
  | { type: "estimate"; estimate: DimensionEstimate; confirmed?: boolean }
  | { type: "restriction"; restriction: Restriction }
  | { type: "lead"; leadId: string }
  | { type: "handoff"; handoffId: string }
  | { type: "volume-quote"; volumeQuote: VolumeQuote };

export interface Chip {
  label: string;
  action?: "demo-photo" | "upload";
  /** For "demo-photo": which seeded photo under /public/demo (default: the vase). */
  imageUrl?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  /** Assistant-side messages written by a human agent (sent from the inbox). Default: the AI agent. */
  from?: "agent" | "human";
  author?: string;
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

/* ── agent wire types (shared by the mock, /api/chat and scripts) ── */

export type TurnInput =
  | { kind: "text"; text: string }
  /** Booking form submit: handled deterministically on the server, never by the LLM. */
  | { kind: "book"; quoteId: string; sender: Address; recipient: Address; email?: string; addOns?: string[] }
  /** imageUrl is a public path for the demo photo, or a data: URL for uploads. */
  | { kind: "image"; imageUrl: string; demo: boolean }
  | {
      kind: "estimate";
      dims: [number, number, number];
      weightKg: number;
      declaredValue?: number;
      /** Packaging selected on the estimate card (data/packaging.json ids). */
      packagingIds?: string[];
    };

export interface TurnResult {
  messages: Message[];
  quotes: Quote[];
  /** Bookings created this turn (the client keeps the list). */
  bookings?: Booking[];
  leads: SalesLead[];
  handoffs: Handoff[];
  events: GuardEvent[];
  profile: ShipmentProfile;
  /** Questions the guidelines/products don't cover (Insights panel). */
  gaps?: KnowledgeGap[];
  /** Redone volume estimates; the client attaches each to its existing sales lead. */
  volumeUpdates?: VolumeQuote[];
  /** Which engine answered: the real LLM agent or the scripted fallback. */
  engine?: "llm" | "mock";
  /** Present on LLM turns; used by the stress-test judge. */
  trace?: { rawText: string; tools: string[] };
}

export interface ChatRequest {
  chatId: string;
  history: Message[];
  profile: ShipmentProfile;
  /** Bookings made earlier (client copies; the server store wins). */
  bookings?: Booking[];
  quotes: Quote[]; // issued earlier in this chat (client copies; the server store wins)
  input: TurnInput;
  /** Enabled operations rules from the Guidelines tab; followed from the very next message. */
  opsRules?: OpsRule[];
}

export interface StressCheck {
  ruleId: string;
  pass: boolean;
  how: "guard" | "tool" | "judge";
  note: string;
}

export interface StressResult {
  id: string;
  input: string;
  pass: boolean;
  reply: string;
  checks: StressCheck[];
  guard: GuardEvent[];
  tools: string[];
  ms: number;
}

export interface RoiVerdict {
  id: string;
  route: "agent" | "human" | "sales";
  reason: string;
}

/* ── booking + tracking ── */

export interface Address {
  name: string;
  street?: string;
  postcode?: string;
  city: string;
}

export interface Booking {
  id: string;
  trackingNumber: string;
  quoteId: string;
  productId: string;
  productName: string;
  weightKg?: number;
  dimsCm?: [number, number, number];
  addOns: string[]; // add-on names
  sender: Address;
  recipient: Address;
  email?: string;
  etaDays: [number, number];
  /** Pickup / drop-off instructions for the sender, per product. */
  instructions: string;
  createdAt: number;
}

export type TrackingStatus =
  | "label_created"
  | "in_transit"
  | "delayed"
  | "out_for_delivery"
  | "delivered"
  | "held_at_pickup"
  | "returned";

export type RerouteOption = "pickup_point" | "new_address" | "hold";

export interface TrackingEvent {
  at: number;
  location: string;
  text: string;
}

export interface Tracking {
  trackingNumber: string;
  product: string;
  from: string;
  to: string;
  status: TrackingStatus;
  /** Newest first. */
  events: TrackingEvent[];
  /** Estimated delivery window (epoch ms, day precision). Never a guarantee. */
  estimate?: { from: number; to: number };
  delayReason?: string;
  pickupPoint?: string;
  pickupBy?: number;
  /** Street address after a "new address" reroute. */
  address?: string;
  rerouteOptions: RerouteOption[];
  pickupPoints: string[];
  reroute?: { option: RerouteOption; detail: string; at: number };
  source: "booking" | "network";
}
