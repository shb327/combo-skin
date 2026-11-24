/** Who runs Combo Skin, as the Terms of Usage, the Privacy Policy and the footer name it
 * (spec 023, Operator identity). Set `legalIdentity` to name the person behind the site: both
 * documents then say "Combo Skin is run by <name>, <address>". It is public, like the rest of
 * the repository. */
export interface Operator {
  name: string
  legalIdentity: { name: string; address: string } | null
  email: string
  country: string
}

export const OPERATOR: Operator = {
  name: 'Combo Skin',
  legalIdentity: null,
  email: 'privacy@combo.skin',
  country: 'Poland',
}

/** "run by one person in Poland", or "run by <name>, <address>, Poland" once it is set. */
export function runBy(operator: Operator): string {
  const identity = operator.legalIdentity
  return identity
    ? `run by ${identity.name}, ${identity.address}, ${operator.country}`
    : `run by one person in ${operator.country}`
}
