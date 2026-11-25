import { z } from 'zod';

const enabledFlag = z.stringbool({ truthy: ['true'], falsy: ['false'], case: 'sensitive' }).default(false);

export function practiceEnabled() {
  return enabledFlag.parse(process.env.PRACTICE_ENABLED);
}
