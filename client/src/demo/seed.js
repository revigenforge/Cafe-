/**
 * Demo seed data for the browser-only build.
 *
 * Mirrors server/src/db/seed.js so the demo shows the same book as a
 * freshly seeded install. Deterministic, so every visitor sees the same
 * numbers and a screenshot stays accurate.
 */
import { normalizePhone } from './phone.js';

export const STATUSES = [
  { id: 1,  name: 'New',            color: 'blue',   sort_order: 10,  funnel_stage: 'NEW',         is_won: 0, is_lost: 0, is_default: 1, active: 1 },
  { id: 2,  name: 'Contacted',      color: 'cyan',   sort_order: 20,  funnel_stage: 'CONTACTED',   is_won: 0, is_lost: 0, is_default: 0, active: 1 },
  { id: 3,  name: 'Interested',     color: 'violet', sort_order: 30,  funnel_stage: 'INTERESTED',  is_won: 0, is_lost: 0, is_default: 0, active: 1 },
  { id: 4,  name: 'Follow-Up',      color: 'amber',  sort_order: 40,  funnel_stage: 'CONTACTED',   is_won: 0, is_lost: 0, is_default: 0, active: 1 },
  { id: 5,  name: 'Meeting Booked', color: 'indigo', sort_order: 50,  funnel_stage: 'MEETING',     is_won: 0, is_lost: 0, is_default: 0, active: 1 },
  { id: 6,  name: 'Proposal Sent',  color: 'teal',   sort_order: 60,  funnel_stage: 'PROPOSAL',    is_won: 0, is_lost: 0, is_default: 0, active: 1 },
  { id: 7,  name: 'Negotiation',    color: 'orange', sort_order: 70,  funnel_stage: 'NEGOTIATION', is_won: 0, is_lost: 0, is_default: 0, active: 1 },
  { id: 8,  name: 'Converted',      color: 'green',  sort_order: 80,  funnel_stage: 'CONVERTED',   is_won: 1, is_lost: 0, is_default: 0, active: 1 },
  { id: 9,  name: 'Not Interested', color: 'rose',   sort_order: 90,  funnel_stage: null,          is_won: 0, is_lost: 1, is_default: 0, active: 1 },
  { id: 10, name: 'Not a Fit',      color: 'rose',   sort_order: 100, funnel_stage: null,          is_won: 0, is_lost: 1, is_default: 0, active: 1 },
  { id: 11, name: 'Lost',           color: 'red',    sort_order: 110, funnel_stage: null,          is_won: 0, is_lost: 1, is_default: 0, active: 1 },
  { id: 12, name: 'Wrong Number',   color: 'slate',  sort_order: 120, funnel_stage: null,          is_won: 0, is_lost: 1, is_default: 0, active: 1 },
];

export const PRIORITIES = [
  { id: 1, name: 'Low',    color: 'slate', weight: 10, sort_order: 10, is_default: 0, active: 1 },
  { id: 2, name: 'Medium', color: 'blue',  weight: 20, sort_order: 20, is_default: 1, active: 1 },
  { id: 3, name: 'High',   color: 'amber', weight: 30, sort_order: 30, is_default: 0, active: 1 },
  { id: 4, name: 'Urgent', color: 'red',   weight: 40, sort_order: 40, is_default: 0, active: 1 },
];

export const SOURCES = ['Claude', 'Manual', 'Website', 'Instagram', 'Referral', 'Google', 'CSV Import', 'Other']
  .map((name, i) => ({ id: i + 1, name, sort_order: (i + 1) * 10, active: 1 }));

export const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'Meeting', 'Follow-Up', 'Note', 'Other']
  .map((name, i) => ({ id: i + 1, name, sort_order: (i + 1) * 10, active: 1 }));

export const OUTCOMES = [
  ['No Answer', 0], ['Voicemail', 0], ['Connected', 1], ['Interested', 1],
  ['Follow-Up Required', 1], ['Meeting Booked', 1], ['Converted', 1],
  ['Not Interested', 1], ['Not a Fit', 1], ['Wrong Number', 0], ['Other', 0],
].map(([name, contact], i) => ({ id: i + 1, name, sort_order: (i + 1) * 10, active: 1, counts_as_contact: contact }));

export const USERS = [
  { id: 1, name: 'Aditya Rao',     email: 'aditya@revigenforge.test',  role: 'ADMIN',       active: 1 },
  { id: 2, name: 'Keeya Menon',    email: 'keeya@revigenforge.test',   role: 'MANAGER',     active: 1 },
  { id: 3, name: 'Atharva Joshi',  email: 'atharva@revigenforge.test', role: 'SALESPERSON', active: 1 },
  { id: 4, name: 'Harsh Bhatia',   email: 'harsh@revigenforge.test',   role: 'SALESPERSON', active: 1 },
  { id: 5, name: 'Nidhi Kulkarni', email: 'nidhi@revigenforge.test',   role: 'SALESPERSON', active: 1 },
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
  ['Fresh Press Juice Bar', "Tara D'Souza", 'Food & Beverage', 'Juice Bar', 'Mumbai', 'Maharashtra'],
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

const NOTES = [
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

const ACT_NOTES = [
  'Rang twice, no answer.',
  'Spoke to the owner, walked through what we do.',
  'Sent the demo link over WhatsApp.',
  'Asked me to send a proposal.',
  'Said they already have someone doing it.',
  'Wrong number — this is a residence.',
  'Left a voicemail.',
  'Met at their shop, showed the demo on my phone.',
  'Quick chat, asked me to follow up next week.',
  'Emailed pricing across.',
];

const TASKS = [
  ['Send proposal to {b}', 'Pull together pricing and the demo link.'],
  ['Follow up with {b}', 'They asked to be called back this week.'],
  ['Prepare meeting notes for {b}', 'Check their current site before the call.'],
  ['Research 20 gyms in Bangalore', 'Build the next batch of leads for the Claude prompt.'],
  ['Update lead information for {b}', 'Contact name and email are missing.'],
  ['Send the cafe demo to {b}', 'Use the Travel Cafe link, it lands better.'],
  ['Chase unanswered proposal at {b}', 'Two weeks since it went out.'],
];

/** Deterministic PRNG so every visitor sees the same book. */
function mulberry32(seed) {
  return function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

const stamp = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};
const day = (days) => stamp(days).slice(0, 10);

export function buildSeed() {
  const rnd = mulberry32(20260912);
  const sales = [3, 4, 5];
  const byName = (arr, n) => arr.find((x) => x.name === n);

  const MIX = [
    ['New', 14], ['Contacted', 9], ['Interested', 7], ['Follow-Up', 6],
    ['Meeting Booked', 4], ['Proposal Sent', 3], ['Negotiation', 2],
    ['Converted', 3], ['Not Interested', 4], ['Not a Fit', 2], ['Lost', 2], ['Wrong Number', 2],
  ];
  const bag = MIX.flatMap(([name, n]) => Array(n).fill(byName(STATUSES, name)));

  const leads = [];
  const activities = [];
  const events = [];
  let actId = 1;
  let evtId = 1;

  BUSINESSES.forEach((biz, i) => {
    const [business_name, contact_name, industry, niche, city, state] = biz;
    const status = bag[i % bag.length];
    const createdDays = -Math.floor(rnd() * 60) - 1;
    const owner = i % 11 === 0 ? null : sales[i % sales.length];
    const hasActivity = status.name !== 'New' || rnd() > 0.6;
    const lastActDays = hasActivity ? Math.max(createdDays, -Math.floor(rnd() * 20)) : null;
    const closed = status.is_won || status.is_lost;

    let followUp = null;
    if (!closed && rnd() > 0.35) {
      const roll = rnd();
      followUp = roll < 0.3 ? day(-Math.ceil(rnd() * 8)) : roll < 0.5 ? day(0) : day(Math.ceil(rnd() * 12));
    }

    const phone = `9${Math.floor(100000000 + rnd() * 899999999)}`;
    const slug = business_name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const id = i + 1;

    leads.push({
      id,
      business_name,
      contact_name,
      phone,
      normalized_phone: normalizePhone(phone),
      email: rnd() > 0.25 ? `hello@${slug}.in` : null,
      website: rnd() > 0.4 ? `https://${slug}.in` : null,
      address: null,
      city,
      state,
      country: 'India',
      industry,
      niche,
      source_id: pick(SOURCES, rnd).id,
      status_id: status.id,
      priority_id: pick(PRIORITIES, rnd).id,
      owner_id: owner,
      estimated_value: rnd() > 0.4 ? Math.round((15000 + rnd() * 85000) / 500) * 500 : null,
      notes: rnd() > 0.5 ? pick(NOTES, rnd) : null,
      created_at: stamp(createdDays),
      updated_at: stamp(Math.max(createdDays, lastActDays ?? createdDays)),
      last_activity_at: lastActDays != null ? stamp(lastActDays) : null,
      next_follow_up_at: followUp,
    });

    events.push({ id: evtId++, lead_id: id, user_id: 2, event_type: 'created', from_value: null, to_value: business_name, created_at: stamp(createdDays) });
    if (owner) {
      events.push({ id: evtId++, lead_id: id, user_id: 2, event_type: 'assigned', from_value: null, to_value: USERS.find((u) => u.id === owner).name, created_at: stamp(createdDays) });
    }

    const depth = STATUSES.findIndex((s) => s.id === status.id);
    const nActs = hasActivity ? Math.min(6, 1 + Math.floor(depth / 2) + Math.floor(rnd() * 2)) : 0;

    for (let a = 0; a < nActs; a++) {
      const when = stamp(Math.max(createdDays, (lastActDays ?? -1) - (nActs - a - 1) * 2));
      const type = pick(ACTIVITY_TYPES, rnd);
      let outcome = pick(OUTCOMES, rnd);
      if (a === nActs - 1) {
        const match = {
          Converted: 'Converted', 'Meeting Booked': 'Meeting Booked', Interested: 'Interested',
          'Not Interested': 'Not Interested', 'Wrong Number': 'Wrong Number', 'Not a Fit': 'Not a Fit',
        }[status.name];
        if (match) outcome = byName(OUTCOMES, match);
      }
      activities.push({
        id: actId++,
        lead_id: id,
        user_id: owner ?? sales[0],
        activity_type_id: type.id,
        outcome_id: outcome.id,
        notes: pick(ACT_NOTES, rnd),
        duration_minutes: type.name === 'Call' ? 1 + Math.floor(rnd() * 12) : null,
        follow_up_date: a === nActs - 1 ? followUp : null,
        created_at: when,
      });
    }

    if (depth > 1 && rnd() > 0.5) {
      events.push({
        id: evtId++, lead_id: id, user_id: owner ?? 2, event_type: 'status_changed',
        from_value: STATUSES[Math.max(0, depth - 1)].name, to_value: status.name,
        created_at: stamp(lastActDays ?? createdDays),
      });
    }
  });

  const tasks = [];
  const prios = ['Low', 'Medium', 'High', 'Urgent'];
  for (let i = 0; i < 34; i++) {
    const lead = pick(leads, rnd);
    const [tpl, desc] = pick(TASKS, rnd);
    const assignee = lead.owner_id ?? pick(sales, rnd);
    const roll = rnd();

    let status = 'To Do';
    let due = day(Math.ceil(rnd() * 10));
    let completed = null;
    if (roll < 0.25) due = day(-Math.ceil(rnd() * 9));
    else if (roll < 0.4) due = day(0);
    else if (roll < 0.55) status = 'In Progress';
    else if (roll < 0.85) {
      status = 'Completed';
      due = day(-Math.ceil(rnd() * 14));
      completed = stamp(-Math.ceil(rnd() * 12));
    }

    tasks.push({
      id: i + 1,
      title: tpl.replace('{b}', lead.business_name),
      description: desc,
      assigned_to: assignee,
      created_by: rnd() > 0.5 ? 2 : assignee,
      lead_id: tpl.includes('{b}') ? lead.id : null,
      due_date: due,
      priority: pick(prios, rnd),
      status,
      completed_at: completed,
      created_at: stamp(-Math.ceil(rnd() * 20)),
      updated_at: stamp(-Math.ceil(rnd() * 5)),
    });
  }

  return {
    users: USERS.map((u) => ({ ...u })),
    statuses: STATUSES.map((s) => ({ ...s })),
    priorities: PRIORITIES.map((p) => ({ ...p })),
    lead_sources: SOURCES.map((s) => ({ ...s })),
    activity_types: ACTIVITY_TYPES.map((t) => ({ ...t })),
    activity_outcomes: OUTCOMES.map((o) => ({ ...o })),
    leads,
    activities,
    tasks,
    events,
    seq: { leads: leads.length, activities: actId, tasks: 34, events: evtId, users: 5, lookup: 100 },
  };
}
