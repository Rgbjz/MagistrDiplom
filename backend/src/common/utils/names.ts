export interface NameSource {
  email: string;
  profile?: { firstName: string | null; lastName: string | null } | null;
}

/** "First Last" from the profile, falling back to the email. */
export function displayName(user: NameSource): string {
  const p = user.profile;
  const name = `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();
  return name || user.email;
}

export const nameSelect = {
  email: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;
