export type WeeekValidationFailureReason =
  | "unauthorized"
  | "network"
  | "upstream_5xx"
  | "unexpected_status";

export class WeeekValidationError extends Error {
  readonly reason: WeeekValidationFailureReason;
  readonly upstreamStatus?: number;

  constructor(reason: WeeekValidationFailureReason, message: string, upstreamStatus?: number) {
    super(message);
    this.name = "WeeekValidationError";
    this.reason = reason;
    this.upstreamStatus = upstreamStatus;
  }
}
