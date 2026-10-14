/** How a member signs in, as the portal names it. */

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  kakao: "카카오",
  facebook: "Facebook",
  line: "LINE",
};

/** A social provider's name ("kakao" → "카카오"); an unknown one as sent. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Every way the account signs in: 이메일 (a password) first, then its social
 *  sign-ins in a fixed order. Empty when it has none. */
export function signInMethods(hasPassword: boolean, socialProviders: readonly string[]): string[] {
  const order = Object.keys(PROVIDER_LABELS);
  const socials = [...new Set(socialProviders)].sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
  );
  return [...(hasPassword ? ["이메일"] : []), ...socials.map(providerLabel)];
}
