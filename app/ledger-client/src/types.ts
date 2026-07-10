// Continuum LedgerClient interface — the A/B seam (spec §4).
// Created by Stream B locally; reconcile with Stream A at convergence.
export type JsCommand =
  | { CreateCommand: { templateId: string; createArguments: Record<string, unknown> } }
  | { ExerciseCommand: { templateId: string; contractId: string; choice: string; choiceArgument: Record<string, unknown> } };
export type Disclosed = { contractId: string; createdEventBlob: string; templateId: string; synchronizerId: string };
export type ActiveContract = { contractId: string; templateId: string; args: Record<string, unknown> };
export type SubmitReq = { commandId: string; actAs: string[]; readAs?: string[]; commands: JsCommand[]; disclosedContracts?: Disclosed[] };
export interface LedgerClient {
  ledgerEnd(): Promise<{ offset: number }>;
  submit(cmd: SubmitReq): Promise<{ updateId: string; completionOffset: number }>;
  activeContracts(party: string, opts?: { templateId?: string; includeBlob?: boolean }): Promise<ActiveContract[]>;
  fetchDisclosed(party: string, cid: string): Promise<Disclosed>;
}
