import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignRole,
  canManageAccount,
  isModerator,
  normalizeModerationReason
} from '../services/ModerationPolicy.js';

test('only admin and moderator roles enter moderation', () => {
  assert.equal(isModerator('admin'), true);
  assert.equal(isModerator('moderator'), true);
  assert.equal(isModerator('author'), false);
  assert.equal(isModerator('guest'), false);
});

test('moderators cannot manage themselves or protected staff accounts', () => {
  const moderator = { id: 5, role: 'moderator' };
  assert.equal(canManageAccount(moderator, { id: 5, role: 'moderator' }), false);
  assert.equal(canManageAccount(moderator, { id: 6, role: 'admin' }), false);
  assert.equal(canManageAccount(moderator, { id: 7, role: 'moderator' }), false);
  assert.equal(canManageAccount(moderator, { id: 8, role: 'author' }), true);
  assert.equal(canManageAccount(moderator, { id: 9, role: 'guest' }), true);
});

test('only administrators assign supported roles and never change themselves', () => {
  const admin = { id: 1, role: 'admin' };
  assert.equal(canAssignRole(admin, { id: 2, role: 'guest' }, 'moderator'), true);
  assert.equal(canAssignRole(admin, { id: 1, role: 'admin' }, 'guest'), false);
  assert.equal(canAssignRole({ id: 3, role: 'moderator' }, { id: 2, role: 'guest' }, 'author'), false);
  assert.equal(canAssignRole(admin, { id: 2, role: 'guest' }, 'owner'), false);
});

test('moderation reasons are normalized and bounded', () => {
  assert.equal(normalizeModerationReason('  spam\n\n links  '), 'spam links');
  assert.equal(normalizeModerationReason('x'.repeat(600)).length, 500);
});
