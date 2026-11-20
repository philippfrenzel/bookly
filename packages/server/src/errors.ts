/** Application errors mapped to HTTP responses by the app error handler. */
import type { ValidationIssue } from '@bookly/shared';

/** Thrown when a mutation would leave the book invalid; maps to 422 `{ issues }`. */
export class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super('validation failed');
  }
}

/** Thrown when an entity does not exist or does not belong to the user; maps to 404. */
export class NotFoundError extends Error {
  constructor() {
    super('not found');
  }
}
