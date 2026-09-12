import { Router } from 'express';
import db from '../db/index.js';
import { handle } from '../middleware/errors.js';
import { visibleOwnerIds, canSeeTeam } from '../middleware/auth.js';
import { int } from '../middleware/validate.js';
import { summary, todayISO, daysAgoISO } from '../lib/metrics.js';
import { LEAD_SELECT } from '../lib/leadQuery.js';

const router = Router();

/**
 * Every figure here comes from lib/metrics.js. The dashboard performs
 * no arithmetic of its own, which is what keeps it agreeing with the
 * analytics page.
 */
router.get(
  '/',
  handle((req, res) => {
    const today = todayISO();
    const mine = { owner_id: req.user.id };
    const team = canSeeTeam(req.user) ? {} : mine;

    const myLeadClause = 'l.owner_id = @me';
    const p = { me: req.user.id, today };

    const followUpsToday = db
      .prepare(
        `${LEAD_SELECT} WHERE ${myLeadClause} AND l.next_follow_up_at IS NOT NULL
           AND date(l.next_follow_up_at) = date(@today) AND s.is_won = 0 AND s.is_lost = 0
         ORDER BY p.weight DESC, l.business_name LIMIT 25`
      )
      .all(p);

    const followUpsOverdue = db
      .prepare(
        `${LEAD_SELECT} WHERE ${myLeadClause} AND l.next_follow_up_at IS NOT NULL
           AND date(l.next_follow_up_at) < date(@today) AND s.is_won = 0 AND s.is_lost = 0
         ORDER BY l.next_follow_up_at LIMIT 25`
      )
      .all(p);

    const newLeads = db
      .prepare(
        `${LEAD_SELECT} WHERE ${myLeadClause} AND s.funnel_stage = 'NEW'
         ORDER BY l.created_at DESC LIMIT 25`
      )
      .all(p);

    const stale = db
      .prepare(
        `${LEAD_SELECT} WHERE ${myLeadClause} AND s.is_won = 0 AND s.is_lost = 0
           AND (l.last_activity_at IS NULL OR date(l.last_activity_at) < date(@cutoff))
         ORDER BY (l.last_activity_at IS NOT NULL), l.last_activity_at LIMIT 25`
      )
      .all({ ...p, cutoff: daysAgoISO(7) });

    const tasksToday = db
      .prepare(
        `SELECT t.*, l.business_name AS lead_business_name FROM tasks t
           LEFT JOIN leads l ON l.id = t.lead_id
          WHERE t.assigned_to = @me AND t.status NOT IN ('Completed','Cancelled')
            AND t.due_date IS NOT NULL AND date(t.due_date) <= date(@today)
          ORDER BY date(t.due_date),
            CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END
          LIMIT 25`
      )
      .all(p);

    const meetingsToday = db
      .prepare(
        `SELECT a.*, l.business_name, at.name AS activity_type_name
           FROM activities a
           JOIN leads l ON l.id = a.lead_id
           LEFT JOIN activity_types at ON at.id = a.activity_type_id
          WHERE a.user_id = @me AND at.name = 'Meeting' AND date(a.created_at) = date(@today)
          ORDER BY a.created_at DESC LIMIT 25`
      )
      .all(p);

    const recentActivity = db
      .prepare(
        `SELECT a.id, a.created_at, a.notes, a.lead_id, l.business_name,
                at.name AS activity_type_name, o.name AS outcome_name, u.name AS user_name
           FROM activities a
           JOIN leads l ON l.id = a.lead_id
           LEFT JOIN activity_types at ON at.id = a.activity_type_id
           LEFT JOIN activity_outcomes o ON o.id = a.outcome_id
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.user_id = @me ORDER BY a.created_at DESC LIMIT 15`
      )
      .all(p);

    const payload = {
      today,
      user: req.user,
      mine: {
        summary: summary(db, mine),
        follow_ups_today: followUpsToday,
        follow_ups_overdue: followUpsOverdue,
        new_leads: newLeads,
        stale_leads: stale,
        tasks_today: tasksToday,
        meetings_today: meetingsToday,
        recent_activity: recentActivity,
      },
    };

    /* Managers and admins also get the team picture and a like-for-like
       comparison between salespeople. */
    if (canSeeTeam(req.user)) {
      const people = db
        .prepare("SELECT id, name, role FROM users WHERE active = 1 AND role != 'ADMIN' ORDER BY name")
        .all();

      payload.team = {
        summary: summary(db, team),
        by_person: people.map((u) => {
          const s = summary(db, { owner_id: u.id });
          return {
            user_id: u.id,
            name: u.name,
            role: u.role,
            leads: s.total_leads,
            contacted: s.contacted_leads,
            activities: s.total_activities,
            meetings: s.meetings_booked,
            converted: s.converted_leads,
            follow_ups_overdue: s.follow_ups_overdue,
            tasks_overdue: s.tasks_overdue,
            conversion_rate: s.conversion_rate,
          };
        }),
        unassigned_leads: db
          .prepare('SELECT COUNT(*) AS n FROM leads WHERE owner_id IS NULL')
          .get().n,
        activities_today: db
          .prepare('SELECT COUNT(*) AS n FROM activities WHERE date(created_at) = date(?)')
          .get(today).n,
      };
    }

    res.json(payload);
  })
);

/**
 * The sales queue: everything that deserves attention, in the order it
 * should be worked. Overdue first, then due today, then untouched, then
 * new. One ordered list rather than four the user has to reconcile.
 */
router.get(
  '/queue',
  handle((req, res) => {
    const today = todayISO();
    const scope = visibleOwnerIds(req.user);
    const limit = Math.min(200, Math.max(1, int(req.query.limit, 'limit') || 50));

    const ownerId =
      req.query.owner_id === 'all' && canSeeTeam(req.user)
        ? null
        : int(req.query.owner_id, 'owner_id', { min: 1 }) || req.user.id;

    const where = ['s.is_won = 0', 's.is_lost = 0'];
    const params = { today, cutoff: daysAgoISO(7), limit };

    if (ownerId) {
      where.push('l.owner_id = @owner_id');
      params.owner_id = ownerId;
    } else if (Array.isArray(scope)) {
      where.push(`l.owner_id IN (${scope.map(Number).join(',')})`);
    }

    const rows = db
      .prepare(
        `${LEAD_SELECT}
          WHERE ${where.join(' AND ')}
            AND (
              (l.next_follow_up_at IS NOT NULL AND date(l.next_follow_up_at) <= date(@today))
              OR s.funnel_stage = 'NEW'
              OR l.last_activity_at IS NULL
              OR date(l.last_activity_at) < date(@cutoff)
            )
          ORDER BY
            CASE
              WHEN l.next_follow_up_at IS NOT NULL AND date(l.next_follow_up_at) < date(@today) THEN 0
              WHEN l.next_follow_up_at IS NOT NULL AND date(l.next_follow_up_at) = date(@today) THEN 1
              WHEN l.last_activity_at IS NULL AND s.funnel_stage = 'NEW' THEN 2
              WHEN l.last_activity_at IS NULL OR date(l.last_activity_at) < date(@cutoff) THEN 3
              ELSE 4
            END,
            p.weight DESC,
            (l.next_follow_up_at IS NULL), l.next_follow_up_at,
            l.created_at
          LIMIT @limit`
      )
      .all(params);

    const reasonFor = (l) => {
      if (l.next_follow_up_at && l.next_follow_up_at.slice(0, 10) < today) return 'Follow-up overdue';
      if (l.next_follow_up_at && l.next_follow_up_at.slice(0, 10) === today) return 'Follow-up due today';
      if (!l.last_activity_at && l.funnel_stage === 'NEW') return 'New, never contacted';
      if (!l.last_activity_at) return 'Never contacted';
      return 'No activity for a while';
    };

    res.json({ today, data: rows.map((l) => ({ ...l, queue_reason: reasonFor(l) })) });
  })
);

export default router;
