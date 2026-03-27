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
  changes: FlareStyleChange[];
}

export interface FlareSessionSnapshot {
  updatedAt: string;
  changes: FlareElementChange[];
}

export interface AgentPushRequest {
  projectRoot: string;
  snapshot: FlareSessionSnapshot;
}
