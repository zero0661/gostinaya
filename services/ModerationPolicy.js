const MODERATOR_ROLES = new Set(['admin', 'moderator']);
const PROTECTED_ROLES = new Set(['admin', 'moderator', 'system', 'legacy']);
const ASSIGNABLE_ROLES = new Set(['guest', 'author', 'moderator', 'admin']);

export function isModerator(role) {
  return MODERATOR_ROLES.has(String(role || '').toLowerCase());
}

export function canManageAccount(actor, target) {
  if (!actor || !target || !isModerator(actor.role)) return false;
  if (Number(actor.id) === Number(target.id)) return false;
  if (actor.role === 'admin') return !['system', 'legacy'].includes(target.role);
  return !PROTECTED_ROLES.has(target.role);
}

export function canAssignRole(actor, target, nextRole) {
  if (actor?.role !== 'admin' || !ASSIGNABLE_ROLES.has(nextRole)) return false;
  if (!target || Number(actor.id) === Number(target.id)) return false;
  return !['system', 'legacy'].includes(target.role);
}

export function normalizeModerationReason(value, limit = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export const moderationRoles = Object.freeze([...MODERATOR_ROLES]);
export const assignableRoles = Object.freeze([...ASSIGNABLE_ROLES]);
