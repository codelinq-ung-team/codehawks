export const ADULT_AGE_ERROR = 'Enter your age in whole years from 18 to 120. This assessment is for adults; include children as household dependents.'

export function validAdultAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= 18 && age <= 120
}
