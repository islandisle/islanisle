import jwt from 'jsonwebtoken';

// Attaches req.user = { id, type: 'user'|'business'|'admin' } from a Bearer token.
export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Batch 25 — like authenticate(), but never blocks: attaches req.user if a
// valid Bearer token is present, otherwise leaves it undefined and moves
// on. For routes that work for a guest (browse-as-guest) but behave
// differently for a logged-in — or Pro — account, e.g. external places'
// contact-info gate.
export function optionalAuthenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    // invalid/expired token on an optional route — proceed as a guest
  }
  next();
}

// Restricts a route to a specific role (e.g. 'business', 'admin').
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `This action requires a ${role} account.` });
    }
    next();
  };
}

// Section 10.1's role levels: "Moderator — approvals only, vs. Full Admin —
// approvals + suspensions + disputes + refund overrides." Every admin route
// still authenticates via requireRole('admin') — a moderator IS an
// admin-role JWT, adminRole is a second claim carrying admin_users.role
// (see admin.js's login) — this additionally blocks the moderator-role
// case from the full-admin-only actions (suspend/reinstate, dispute
// resolution, payout runs, marking a business trusted). Approve/reject and
// the approval queue stay on plain requireRole('admin') so both levels can
// still do the one thing moderators exist for.
export function requireFullAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'This action requires an admin account.' });
  }
  if (req.user?.adminRole === 'moderator') {
    return res.status(403).json({ error: 'This action requires Full Admin — moderators can only manage the approval queue.' });
  }
  next();
}
