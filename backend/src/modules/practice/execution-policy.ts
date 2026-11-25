import { AppError } from '../../errors.js';
/** Imported catalogue entries remain read/edit-only until digest-bound runtime release verification is commissioned. */
export const catalogueExecutionPending = (catalogue: unknown) => Boolean(catalogue);
export function requireProblemExecution(catalogue: unknown) {
  if (catalogueExecutionPending(catalogue)) throw new AppError(409, 'CATALOGUE_EXECUTION_PENDING',
    'This problem is available for reading and editing. Code execution is not available yet.');
}
