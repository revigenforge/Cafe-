/**
 * Demo data: five users and a book of leads with a realistic spread of
 * activity, so every dashboard, funnel and performance figure has
 * something true to show.
 *
 * Safe to re-run — it clears the demo tables first. It never touches
 * the lookup tables, so admin edits to statuses or sources survive.
 */
import db from './index.js';
import { migrate } from './migrate.js';
import { normalizePhone } from '../lib/phone.js';

const USERS = [
  ['Aditya Rao', 'aditya@revigenforge.test', 'ADMIN'],
  ['Keeya Menon', 'keeya@revigenforge.test', 'MANAGER'],
  ['Atharva Joshi', 'atharva@revigenforge.test', 'SALESPERSON'],
  ['Harsh Bhatia', 'harsh@revigenforge.test', 'SALESPERSON'],
  ['Nidhi Kulkarni', 'nidhi@revigenforge.test', 'SALESPERSON'],
];

const BUSINESSES = [
  ['Iron Forge Gym', 'Rahul Shetty', 'Fitness', 'Gym', 'Bangalore', 'Karnataka'],
  ['Pulse Fitness Studio', 'Meera Nair', 'Fitness', 'Gym', 'Bangalore', 'Karnataka'],
  ['The Travel Cafe', 'Sonam Lepcha', 'Food & Beverage', 'Cafe', 'Gangtok', 'Sikkim'],
  ['Cafe Mehrban', 'Prince Ajmani', 'Food & Beverage', 'Cafe', 'Ranchi', 'Jharkhand'],
  ['Sunrise Dental', 'Dr Anil Kumar', 'Healthcare', 'Dental Clinic', 'Pune', 'Maharashtra'],
  ['Smile Studio Dental', 'Dr Priya Desai', 'Healthcare', 'Dental Clinic', 'Mumbai', 'Maharashtra'],
  ['Urban Threads', 'Kabir Malhotra', 'Retail', 'Clothing', 'Delhi', 'Delhi'],
  ['Weave & Wear', 'Ritu Agarwal', 'Retail', 'Clothing', 'Jaipur', 'Rajasthan'],
  ['Bean There Roasters', 'Arjun Pillai', 'Food & Beverage', 'Coffee Roaster', 'Kochi', 'Kerala'],
  ['Peak Adventures', 'Tenzing Bhutia', 'Travel', 'Tour Operator', 'Gangtok', 'Sikkim'],
  ['Lotus Yoga Shala', 'Divya Iyer', 'Fitness', 'Yoga Studio', 'Chennai', 'Tamil Nadu'],
  ['CrossFit Kormangala', 'Vikram Singh', 'Fitness', 'Gym', 'Bangalore', 'Karnataka'],
  ['Green Leaf Organics', 'Shalini Rao', 'Retail', 'Grocery', 'Hyderabad', 'Telangana'],
  ['Metro Auto Care', 'Imran Khan', 'Automotive', 'Garage', 'Mumbai', 'Maharashtra'],
  ['Bright Minds Tutoring', 'Sneha Kapoor', 'Education', 'Tutoring', 'Pune', 'Maharashtra'],
  ['The Cut Above Salon', 'Farah Sheikh', 'Beauty', 'Salon', 'Delhi', 'Delhi'],
  ['Glow Skin Clinic', 'Dr Neha Reddy', 'Healthcare', 'Dermatology', 'Hyderabad', 'Telangana'],
  ['Trailhead Outfitters', 'Karan Thapa', 'Retail', 'Outdoor Gear', 'Dehradun', 'Uttarakhand'],
  ['Spice Route Kitchen', 'Ananya Bose', 'Food & Beverage', 'Restaurant', 'Kolkata', 'West Bengal'],
  ['Zen Wellness Spa', 'Maya Pillai', 'Beauty', 'Spa', 'Goa', 'Goa'],
  ['Apex Physiotherapy', 'Dr Rohit Verma', 'Healthcare', 'Physiotherapy', 'Bangalore', 'Karnataka'],
  ['Nomad Hostels', 'Ishaan Gupta', 'Travel', 'Hostel', 'Rishikesh', 'Uttarakhand'],
  ['Fresh Press Juice Bar', 'Tara D\'Souza', 'Food & Beverage', 'Juice Bar', 'Mumbai', 'Maharashtra'],
  ['Summit Climbing Gym', 'Jay Patel', 'Fitness', 'Climbing Gym', 'Ahmedabad', 'Gujarat'],
  ['Petal & Stem Florists', 'Lakshmi Menon', 'Retail', 'Florist', 'Chennai', 'Tamil Nadu'],
  ['Roadside Coffee Co', 'Dev Anand', 'Food & Beverage', 'Cafe', 'Bangalore', 'Karnataka'],
  ['Momo Junction', 'Pema Sherpa', 'Food & Beverage', 'Restaurant', 'Darjeeling', 'West Bengal'],
  ['Precision Opticals', 'Sanjay Mehta', 'Healthcare', 'Optician', 'Pune', 'Maharashtra'],
  ['Barre & Beyond', 'Ritika Shah', 'Fitness', 'Pilates Studio', 'Mumbai', 'Maharashtra'],
  ['Canvas Art Supplies', 'Nikhil Roy', 'Retail', 'Art Supplies', 'Kolkata', 'West Bengal'],
  ['Hilltop Homestay', 'Dorjee Tamang', 'Travel', 'Homestay', 'Gangtok', 'Sikkim'],
  ['Anvil Barbers', 'Yusuf Ali', 'Beauty', 'Barbershop', 'Hyderabad', 'Telangana'],
  ['Quick Fix Plumbing', 'Ramesh Yadav', 'Home Services', 'Plumbing', 'Delhi', 'Delhi'],
  ['Bloom Bakery', 'Aisha Rahman', 'Food & Beverage', 'Bakery', 'Bangalore', 'Karnataka'],
  ['Trek Nepal Tours', 'Bikash Gurung', 'Travel', 'Tour Operator', 'Siliguri', 'West Bengal'],
  ['Stellar Coaching Centre', 'Prakash Nair', 'Education', 'Coaching', 'Kochi', 'Kerala'],
  ['Velocity Cycles', 'Ajay Kumar', 'Retail', 'Bicycle Shop', 'Pune', 'Maharashtra'],
  ['Pure Ayurveda Clinic', 'Dr Suresh Menon', 'Healthcare', 'Ayurveda', 'Thrissur', 'Kerala'],
  ['The Book Nook', 'Ira Chatterjee', 'Retail', 'Bookshop', 'Kolkata', 'West Bengal'],
  ['Skyline Event Rentals', 'Manav Chopra', 'Events', 'Rentals', 'Delhi', 'Delhi'],
  ['Coastal Surf School', 'Leo Fernandes', 'Travel', 'Surf School', 'Goa', 'Goa'],
  ['Knead & Rise Pizzeria', 'Marco Dias', 'Food & Beverage', 'Restaurant', 'Goa', 'Goa'],
  ['Elite Martial Arts', 'Sensei Raj', 'Fitness', 'Martial Arts', 'Chennai', 'Tamil Nadu'],
  ['Clear View Windows', 'Gopal Krishnan', 'Home Services', 'Cleaning', 'Bangalore', 'Karnataka'],
  ['Little Sprouts Daycare', 'Nandini Rao', 'Education', 'Daycare', 'Hyderabad', 'Telangana'],
  ['Heritage Jewellers', 'Rajesh Soni', 'Retail', 'Jewellery', 'Jaipur', 'Rajasthan'],
  ['Rapid Print Solutions', 'Faisal Ahmed', 'Business Services', 'Printing', 'Mumbai', 'Maharashtra'],
  ['Serene Dental Care', 'Dr Kavita Joshi', 'Healthcare', 'Dental Clinic', 'Nagpur', 'Maharashtra'],
  ['Tandem Coworking', 'Rohan Mehra', 'Business Services', 'Coworking', 'Bangalore', 'Karnataka'],
  ['Fireside Pottery', 'Mira Sen', 'Retail', 'Pottery Studio', 'Auroville', 'Tamil Nadu'],
];

const NOTE_POOL = [
  'Owner asked to call back after 6pm.',
  'Currently uses a Wix site, unhappy with speed.',
  'No website at all, only Instagram.',
  'Wants to see examples before committing.',
  'Budget looks tight but interested in the basic package.',
  'Gatekeeper would not put me through.',
  'Very keen — asked for a proposal by Friday.',
  'Said to try again next quarter.',
  'Referred by an existing client.',
  'Site exists but is not mobile friendly.',
];

const ACTIVITY_NOTES = [
  'Rang twice, no answer.',
  'Spoke to the owner, walked through what we do.',
  'Sent the demo link over WhatsApp.',
  'Asked me to send a proposal.',
  'Said they already have someone doing it.',
  'Wrong number — this is a residence.',
  'Left a voicemail.',
  'Met at their shop, showed the cafe demo on my phone.',
  'Quick chat, asked me to follow up next week.',
  'Emailed pricing across.',
];

const TASK_TITLES = [
  ['Send proposal to {b}', 'Pull together pricing and the demo link.'],
  ['Follow up with {b}', 'They asked to be called back this week.'],
  ['Prepare meeting notes for {b}', 'Check their current site before the call.'],
  ['Research 20 gyms in Bangalore', 'Build the next batch of leads for the Claude prompt.'],
  ['Update lead information for {b}', 'Contact name and email are missing.'],
  ['Send the cafe demo to {b}', 'Use the Travel Cafe link, it lands better.'],
  ['Chase unanswered proposal at {b}', 'Two weeks since it went out.'],
];

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

/** Deterministic PRNG so reseeding gives the same demo book. */
function mulberry32(seed) {
  return function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayOffset = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};
const dateOffset = (n) => dayOffset(n).slice(0, 10);

export function seed({ quiet = false } = {}) {
  migrate({ quiet: true });
  const rnd = mulberry32(20260912);

  db.transaction(() => {
    db.prepare('DELETE FROM lead_events').run();
    db.prepare('DELETE FROM activities').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM leads').run();
    db.prepare('DELETE FROM users').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('users','leads','activities','tasks','lead_events')").run();

    // ── users ──
    const insUser = db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)');
    const userIds = USERS.map(([n, e, r]) => insUser.run(n, e, r).lastInsertRowid);
    const sales = userIds.slice(2); // the three salespeople
    const manager = userIds[1];

    const statuses = db.prepare('SELECT * FROM statuses ORDER BY sort_order').all();
    const priorities = db.prepare('SELECT * FROM priorities ORDER BY weight').all();
    const sources = db.prepare('SELECT * FROM lead_sources').all();
    const types = db.prepare('SELECT * FROM activity_types').all();
    const outcomes = db.prepare('SELECT * FROM activity_outcomes').all();

    const byName = (arr, n) => arr.find((x) => x.name === n);

    const insLead = db.prepare(
      `INSERT INTO leads
        (business_name, contact_name, phone, normalized_phone, email, website, city, state, country,
         industry, niche, source_id, status_id, priority_id, owner_id, estimated_value, notes,
         created_at, updated_at, last_activity_at, next_follow_up_at)
       VALUES
        (@business_name, @contact_name, @phone, @normalized_phone, @email, @website, @city, @state, @country,
         @industry, @niche, @source_id, @status_id, @priority_id, @owner_id, @estimated_value, @notes,
         @created_at, @updated_at, @last_activity_at, @next_follow_up_at)`
    );
    const insAct = db.prepare(
      `INSERT INTO activities (lead_id, user_id, activity_type_id, outcome_id, notes, duration_minutes, follow_up_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insEvent = db.prepare(
      `INSERT INTO lead_events (lead_id, user_id, event_type, from_value, to_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    /* A weighted spread so the funnel narrows the way a real one does,
       rather than every stage holding the same number. */
    const STATUS_MIX = [
      ['New', 14], ['Contacted', 9], ['Interested', 7], ['Follow-Up', 6],
      ['Meeting Booked', 4], ['Proposal Sent', 3], ['Negotiation', 2],
      ['Converted', 3], ['Not Interested', 4], ['Not a Fit', 2], ['Lost', 2], ['Wrong Number', 2],
    ];
    const statusBag = STATUS_MIX.flatMap(([name, n]) => Array(n).fill(byName(statuses, name)));

    BUSINESSES.forEach((biz, i) => {
      const [business_name, contact_name, industry, niche, city, state] = biz;
      const status = statusBag[i % statusBag.length];
      const createdDays = -Math.floor(rnd() * 60) - 1;

      // a handful stay unassigned so the "Unassigned" view has content
      const owner = i % 11 === 0 ? null : sales[i % sales.length];

      const hasActivity = !['New'].includes(status.name) || rnd() > 0.6;
      const lastActDays = hasActivity ? Math.max(createdDays, -Math.floor(rnd() * 20)) : null;

      const isClosed = status.is_won || status.is_lost;
      let followUp = null;
      if (!isClosed && rnd() > 0.35) {
        // a mix of overdue, today, and upcoming
        const roll = rnd();
        followUp = roll < 0.3 ? dateOffset(-Math.ceil(rnd() * 8)) : roll < 0.5 ? dateOffset(0) : dateOffset(Math.ceil(rnd() * 12));
      }

      const phone = `9${Math.floor(100000000 + rnd() * 899999999)}`;
      const slug = business_name.toLowerCase().replace(/[^a-z0-9]+/g, '');

      const leadId = insLead.run({
        business_name,
        contact_name,
        phone,
        normalized_phone: normalizePhone(phone),
        email: rnd() > 0.25 ? `hello@${slug}.in` : null,
        website: rnd() > 0.4 ? `https://${slug}.in` : null,
        city,
        state,
        country: 'India',
        industry,
        niche,
        source_id: pick(sources, rnd).id,
        status_id: status.id,
        priority_id: pick(priorities, rnd).id,
        owner_id: owner,
        estimated_value: rnd() > 0.4 ? Math.round((15000 + rnd() * 85000) / 500) * 500 : null,
        notes: rnd() > 0.5 ? pick(NOTE_POOL, rnd) : null,
        created_at: dayOffset(createdDays),
        updated_at: dayOffset(Math.max(createdDays, lastActDays ?? createdDays)),
        last_activity_at: lastActDays != null ? dayOffset(lastActDays) : null,
        next_follow_up_at: followUp,
      }).lastInsertRowid;

      insEvent.run(leadId, manager, 'created', null, business_name, dayOffset(createdDays));
      if (owner) insEvent.run(leadId, manager, 'assigned', null, USERS[userIds.indexOf(owner)][0], dayOffset(createdDays));

      // activities, more of them the further down the funnel a lead sits
      const depth = statuses.findIndex((s) => s.id === status.id);
      const nActs = hasActivity ? Math.min(6, 1 + Math.floor(depth / 2) + Math.floor(rnd() * 2)) : 0;

      for (let a = 0; a < nActs; a++) {
        const when = dayOffset(Math.max(createdDays, (lastActDays ?? -1) - (nActs - a - 1) * 2));
        const type = pick(types, rnd);
        let outcome = pick(outcomes, rnd);
        // make the last activity agree with where the lead ended up
        if (a === nActs - 1) {
          if (status.name === 'Converted') outcome = byName(outcomes, 'Converted');
          else if (status.name === 'Meeting Booked') outcome = byName(outcomes, 'Meeting Booked');
          else if (status.name === 'Interested') outcome = byName(outcomes, 'Interested');
          else if (status.name === 'Not Interested') outcome = byName(outcomes, 'Not Interested');
          else if (status.name === 'Wrong Number') outcome = byName(outcomes, 'Wrong Number');
          else if (status.name === 'Not a Fit') outcome = byName(outcomes, 'Not a Fit');
        }
        insAct.run(
          leadId,
          owner ?? sales[0],
          type.id,
          outcome.id,
          pick(ACTIVITY_NOTES, rnd),
          type.name === 'Call' ? 1 + Math.floor(rnd() * 12) : null,
          a === nActs - 1 ? followUp : null,
          when
        );
      }

      if (depth > 1 && rnd() > 0.5) {
        insEvent.run(
          leadId,
          owner ?? manager,
          'status_changed',
          statuses[Math.max(0, depth - 1)].name,
          status.name,
          dayOffset(lastActDays ?? createdDays)
        );
      }
    });

    // ── tasks ──
    const insTask = db.prepare(
      `INSERT INTO tasks (title, description, assigned_to, created_by, lead_id, due_date, priority, status, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const leadRows = db.prepare('SELECT id, business_name, owner_id FROM leads').all();
    const prios = ['Low', 'Medium', 'High', 'Urgent'];

    for (let i = 0; i < 34; i++) {
      const lead = pick(leadRows, rnd);
      const [tpl, desc] = pick(TASK_TITLES, rnd);
      const assignee = lead.owner_id ?? pick(sales, rnd);
      const roll = rnd();

      // a deliberate mix of overdue, due today, upcoming and done
      let status = 'To Do';
      let due = dateOffset(Math.ceil(rnd() * 10));
      let completed = null;
      if (roll < 0.25) {
        due = dateOffset(-Math.ceil(rnd() * 9)); // overdue
      } else if (roll < 0.4) {
        due = dateOffset(0); // today
      } else if (roll < 0.55) {
        status = 'In Progress';
      } else if (roll < 0.85) {
        status = 'Completed';
        due = dateOffset(-Math.ceil(rnd() * 14));
        completed = dayOffset(-Math.ceil(rnd() * 12));
      }

      insTask.run(
        tpl.replace('{b}', lead.business_name),
        desc,
        assignee,
        rnd() > 0.5 ? manager : assignee,
        tpl.includes('{b}') ? lead.id : null,
        due,
        pick(prios, rnd),
        status,
        completed,
        dayOffset(-Math.ceil(rnd() * 20)),
        dayOffset(-Math.ceil(rnd() * 5))
      );
    }
  })();

  if (!quiet) {
    const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    console.log('demo data loaded');
    console.log(`  users=${n('users')}  leads=${n('leads')}  activities=${n('activities')}  tasks=${n('tasks')}  events=${n('lead_events')}`);
    console.log('\n  sign in as any of:');
    db.prepare('SELECT id, name, role FROM users ORDER BY id').all()
      .forEach((u) => console.log(`    ${String(u.id).padStart(2)}  ${u.name.padEnd(18)} ${u.role}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) seed();
