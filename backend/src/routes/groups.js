// Travel groups — script Section 2.2.
// The group itself is created at signup (see auth.js); this covers viewing
// and managing an existing group — the "Group management lives in User
// Settings" requirement.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/groups/mine
 * Returns the logged-in user's group (as creator or member), with the
 * QR code payload and the member list.
 */
router.get('/mine', authenticate, async (req, res) => {
  const membership = await query(
    `SELECT tg.id, tg.group_code, tg.max_members, tg.creator_user_id, tgm.role
     FROM travel_group_members tgm
     JOIN travel_groups tg ON tg.id = tgm.travel_group_id
     WHERE tgm.user_id = $1`,
    [req.user.id]
  );

  if (!membership.rows.length) {
    return res.json({ group: null });
  }
  const group = membership.rows[0];

  const members = await query(
    `SELECT tgm.id, tgm.user_id, tgm.placeholder_name, tgm.role, u.name AS user_name
     FROM travel_group_members tgm
     LEFT JOIN users u ON u.id = tgm.user_id
     WHERE tgm.travel_group_id = $1`,
    [group.id]
  );

  res.json({
    group: {
      id: group.id,
      group_code: group.group_code,
      max_members: group.max_members,
      my_role: group.role,
      members: members.rows.map((m) => ({
        id: m.id,
        user_id: m.user_id || null, // real users.id, for the "book for a subset" member picker (ListingDetail.jsx) — null for placeholders, who have no account to book into
        name: m.user_name || m.placeholder_name,
        is_signed_up: !!m.user_id,
        role: m.role,
      })),
    },
  });
});

/**
 * POST /api/groups/join
 * body: { group_code }
 * Section 2.2: "Joining after already signing up" — scan/enter a Group QR
 * from your own profile.
 */
router.post('/join', authenticate, async (req, res) => {
  const { group_code } = req.body;
  const groupResult = await query(
    `SELECT id, max_members FROM travel_groups WHERE group_code = $1`,
    [group_code]
  );
  if (!groupResult.rows.length) {
    return res.status(404).json({ error: 'Group not found. Check the code and try again.' });
  }
  const group = groupResult.rows[0];

  const countResult = await query(
    `SELECT COUNT(*) FROM travel_group_members WHERE travel_group_id = $1`,
    [group.id]
  );
  if (Number(countResult.rows[0].count) >= group.max_members) {
    return res.status(400).json({ error: `This group is full (max ${group.max_members}).` });
  }

  const alreadyIn = await query(
    `SELECT id FROM travel_group_members WHERE travel_group_id = $1 AND user_id = $2`,
    [group.id, req.user.id]
  );
  if (alreadyIn.rows.length) {
    return res.status(400).json({ error: 'You are already in this group.' });
  }

  await query(
    `INSERT INTO travel_group_members (travel_group_id, user_id, join_method, role)
     VALUES ($1, $2, 'qr_scan', 'member')`,
    [group.id, req.user.id]
  );

  res.status(201).json({ status: 'joined', group_id: group.id });
});

/**
 * POST /api/groups/:id/members/:memberId/remove
 * Section 2.2: only the group admin (creator) can remove members.
 */
router.post('/:id/members/:memberId/remove', authenticate, async (req, res) => {
  const { id, memberId } = req.params;

  const groupResult = await query('SELECT creator_user_id FROM travel_groups WHERE id = $1', [id]);
  if (!groupResult.rows.length) {
    return res.status(404).json({ error: 'Group not found.' });
  }
  if (groupResult.rows[0].creator_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the group admin can remove members.' });
  }

  await query('DELETE FROM travel_group_members WHERE id = $1 AND travel_group_id = $2', [memberId, id]);
  res.json({ status: 'removed' });
});

export default router;
