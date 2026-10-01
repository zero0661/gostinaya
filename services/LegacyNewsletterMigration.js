export function legacyMigrationPlan(newsletters, members) {
  const legacy = newsletters.find(item => item.name === 'После логина');
  const ru = newsletters.find(item => item.name === 'После логина — RU');
  const en = newsletters.find(item => item.name === 'After Login — EN');
  if (!ru || !en) throw new Error('Both RU and EN newsletters must exist');
  if (!legacy) return { migrate: [], review: [], legacy: null };
  const migrate = [], review = [];
  for (const member of members) {
    if (member.subscribed === false || member.email_suppression?.suppressed === true) continue;
    const ids = new Set((member.newsletters || []).map(item => item.id));
    if (!ids.has(legacy.id) || ids.has(ru.id)) continue;
    // EN-only may be an explicit choice made after the language split.
    (ids.has(en.id) ? review : migrate).push({ id: member.id, email: member.email });
  }
  return { migrate, review, legacy };
}
