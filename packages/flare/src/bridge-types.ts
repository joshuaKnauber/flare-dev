export interface FlareStyleChange {
  property: string;
  before: string;
  after: string;
}

export interface FlareElementChange {
  selector: string;
  path: string;
  textSnippet?: string;
  comment?: string;
  source?: string;
  componentStack?: string[];
  changes: FlareStyleChange[];
  variantSource?: string;
  variantExportName?: string;
}

export interface FlareSessionSnapshot {
  updatedAt: string;
  changes: FlareElementChange[];
}

export interface AgentPushRequest {
  origin: string;
  snapshot: FlareSessionSnapshot;
}
