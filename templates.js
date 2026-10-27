/* CV Editor – templates. Each template is a small layout program: it places real text boxes, lines and shapes,
 * measuring every text box in its font so the blocks stack with exact gaps. Built when the gallery opens.
 *
 * What the designs follow (from recruiter and ATS research, 2025–2026):
 *  - one clear reading path: single column, or a main column plus a narrow side column read after it;
 *  - a strong name, then consistent H2 section heads, role/company/date lines, short bulleted achievements;
 *  - one accent colour on near-black text, plenty of white space, 9.5–11 pt body text;
 *  - no skill bars or ratings – skills are plain text or text tags, so ATS still read them;
 *  - a photo only where it is customary (the Creative template; the circle is easy to delete). */
'use strict';

const TPL_W = PAPER.A4.w, TPL_H = PAPER.A4.h;
const AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='#d9d4e4'/>"
  + "<circle cx='60' cy='48' r='22' fill='#a69dbd'/><path d='M16 120c4-27 22-41 44-41s40 14 44 41z' fill='#a69dbd'/></svg>");

// Tracking (letter-spacing) stays under about 0.04 em: more than that makes the browser's PDF write each letter with a gap,
// and text extractors then read headings as "EXPERI ENC E" – which an ATS cannot match to a section.
// Style sheet shorthand: [font, size, weight, color, extra]
const st = (label, font, size, weight, color, extra = {}) =>
  ({ label, font, size, weight, color, italic: false, upper: false, lh: 1.35, ls: 0, align: 'left', ...extra });

// Placing kit: every call adds an element to the page and returns the y just below it.
function tplKit(d) {
  const els = d.pages[0].els, meas = h('div', { style: 'position:absolute;left:-20000px;top:0;visibility:hidden' });
  document.body.append(meas);
  const size = (e) => { const n = buildNode(e); meas.append(n); const r = n.getBoundingClientRect(); n.remove(); return r; };
  const k = {
    T(x, y, w, style, text, extra = {}) {
      const e = { id: uid(), type: 'text', x, y, w, style, o: {}, bullet: 'none', text, ...extra };
      els.push(e); return y + size(e).height;
    },
    L(x, y, len, color, th = 1, extra = {}) {
      els.push({ id: uid(), type: 'line', name: len < 60 ? 'Heading accent' : 'Divider', x, y, len, th, color, dash: 'solid', vert: false, ...extra }); return y + th;
    },
    V(x, y, len, color, th = 1) { els.push({ id: uid(), type: 'line', x, y, len, th, color, dash: 'solid', vert: true }); return y + len; },
    R(x, y, w, hh, fill, extra = {}) { els.push({ id: uid(), type: 'rect', name: 'Background', x, y, w, h: hh, fill, stroke: fill, sw: 0, radius: 0, opacity: 1, ...extra }); return y + hh; },
    I(x, y, w, hh, src, extra = {}) { els.push({ id: uid(), type: 'image', name: 'Photo', x, y, w, h: hh, src, radius: 0, opacity: 1, fit: 'cover', ...extra }); return y + hh; },
    // tags that wrap onto new rows inside width w
    chips(x, y, w, items, extra, gap = 6) {
      let cx = x, cy = y, rowH = 0;
      items.forEach((t) => {
        const e = { id: uid(), type: 'text', x: cx, y: cy, w: 100, autoW: true, style: 'small', o: {}, bullet: 'none', text: t, ...extra };
        const r = size(e);
        if (cx > x && cx + r.width > x + w) { cx = x; cy += rowH + gap; rowH = 0; e.x = cx; e.y = cy; }
        els.push(e); cx += r.width + gap; rowH = Math.max(rowH, r.height);
      });
      return cy + rowH;
    },
    done() { meas.remove(); },
  };
  return k;
}

// ---------------------------------------------------------------- the templates
const TEMPLATES = [
  {
    id: 'classic', name: 'Classic', tags: ['1 column', 'ATS-safe', 'Serif'],
    desc: 'Centred serif header, ruled sections. Timeless for finance, law, consulting and academia.',
    margin: 56, palette: ['#1a1a1a', '#7b2230', '#555555', '#cdbfc1', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'EB Garamond', 30, 600, '#1a1a1a', { align: 'center', ls: 0.5, lh: 1.1 }),
      h2: st('Heading 2 · Section', 'EB Garamond', 12.5, 600, '#7b2230', { upper: true, ls: 0.5, lh: 1.2 }),
      h3: st('Heading 3 · Role / Degree', 'Source Serif 4', 11, 400, '#1a1a1a', { lh: 1.35 }),
      h4: st('Heading 4 · Dates / Meta', 'Source Serif 4', 9.5, 400, '#555555', { italic: true }),
      body: st('Body text', 'Source Serif 4', 10.5, 400, '#262626', { lh: 1.48 }),
      small: st('Small text', 'Source Serif 4', 9, 400, '#444444', { lh: 1.4 }),
    },
    build(k) {
      const x = 56, w = TPL_W - 112;
      let y = k.T(x, 56, w, 'h1', 'Eleanor Whitfield');
      y = k.T(x, y + 4, w, 'h4', 'Senior Financial Analyst', { o: { italic: false, upper: true, ls: 0.4, color: '#7b2230', align: 'center', size: 10 } });
      y = k.T(x, y + 6, w, 'small', 'London, UK  ·  eleanor.whitfield@example.com  ·  +44 20 7946 0958  ·  linkedin.com/in/ewhitfield', { o: { align: 'center' } });
      y = k.L(x, y + 12, w, '#1a1a1a', 1) + 2; y = k.L(x, y, w, '#1a1a1a', 0.5);
      const sec = (title) => { y = k.T(x, y + 20, w, 'h2', title); y = k.L(x, y + 3, w, '#cdbfc1', 0.75) + 10; };
      const role = (t, meta, bullets) => {
        y = k.T(x, y, w, 'h3', t); y = k.T(x, y + 1, w, 'h4', meta);
        y = k.T(x, y + 5, w, 'body', bullets.join('\n'), { bullet: 'dot' }) + 13;
      };
      sec('Profile');
      y = k.T(x, y, w, 'body', 'Chartered financial analyst with nine years in corporate finance and equity research. Builds the models, forecasts and board-level narratives behind capital decisions, and is known for turning complex numbers into clear recommendations.') + 2;
      sec('Experience');
      role('**Senior Financial Analyst**, Meridian Capital Partners\t2021 – Present', 'London  ·  Corporate Finance', [
        'Own the three-statement model for a £2.4bn portfolio; forecasts land within **2%** of actuals',
        'Led due diligence on 6 acquisitions, including a £180m carve-out completed two weeks early',
        'Redesigned monthly reporting, cutting close-to-board time from 12 to **5 days**',
        'Present quarterly results and capital plans to the CFO and the audit committee']);
      role('**Financial Analyst**, Contoso Bank\t2018 – 2021', 'London  ·  Equity Research', [
        'Covered 14 mid-cap industrials; three initiations ranked top-quartile by institutional clients',
        'Built a pricing dashboard used daily by a 30-person sales desk',
        'Published 40+ research notes; quoted in the Financial Times and Reuters']);
      role('**Graduate Analyst**, Fabrikam Group\t2016 – 2018', 'Manchester  ·  FP&A rotation', [
        'Automated variance analysis in Excel and SQL, saving 20 hours a month',
        'Supported the annual budget for a £300m consumer-goods division']);
      sec('Education');
      y = k.T(x, y, w, 'h3', '**MSc Finance**, London School of Economics\t2015 – 2016');
      y = k.T(x, y + 1, w, 'h4', 'Distinction  ·  Dissertation on credit risk in private markets') + 8;
      y = k.T(x, y, w, 'h3', '**BSc Economics**, University of Edinburgh\t2012 – 2015');
      y = k.T(x, y + 1, w, 'h4', 'First Class Honours') + 2;
      sec('Skills & Certifications');
      k.T(x, y, w, 'body', '**Certifications:** CFA Charterholder, ACCA Part-qualified\n**Modelling:** DCF, LBO, merger models, scenario and sensitivity analysis\n**Tools:** Excel / VBA, SQL, Power BI, Bloomberg, Capital IQ\n**Languages:** English (native), French (professional)\n**Interests:** marathon running, chess, mentoring young women in finance');
    },
  },
  {
    id: 'modern', name: 'Modern', tags: ['1 column', 'ATS-safe', 'Sans'],
    desc: 'Clean Inter type, a single teal accent and skill tags. Fits product, marketing and most office roles.',
    margin: 52, palette: ['#0f172a', '#0f766e', '#64748b', '#e6f4f1', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'Inter', 28, 700, '#0f172a', { ls: -0.5, lh: 1.1 }),
      h2: st('Heading 2 · Section', 'Inter', 9.5, 700, '#0f766e', { upper: true, ls: 0.35, lh: 1.2 }),
      h3: st('Heading 3 · Role / Degree', 'Inter', 11, 400, '#0f172a', { lh: 1.35 }),
      h4: st('Heading 4 · Dates / Meta', 'Inter', 9.5, 400, '#64748b'),
      body: st('Body text', 'Inter', 10, 400, '#334155', { lh: 1.55 }),
      small: st('Small text', 'Inter', 9, 400, '#475569', { lh: 1.4 }),
    },
    build(k) {
      const x = 52, w = TPL_W - 104;
      k.R(0, 0, TPL_W, 6, '#0f766e', { name: 'Top stripe' });
      let y = k.T(x, 54, w, 'h1', 'Maya Chen');
      y = k.T(x, y + 4, w, 'h3', 'Senior Product Manager  ·  B2B SaaS', { o: { color: '#0f766e', size: 12, weight: 600 } });
      y = k.T(x, y + 8, w, 'small', ':mail: maya.chen@example.com    :phone: +1 415 555 0142    :location: San Francisco, CA    :linkedin: linkedin.com/in/mayachen', { ic: '#0f766e' });
      y = k.L(x, y + 16, w, '#e2e8f0', 1);
      const sec = (title) => { y = k.T(x, y + 22, w, 'h2', title) + 10; };
      const role = (t, meta, bullets) => {
        y = k.T(x, y, w, 'h3', t); y = k.T(x, y + 2, w, 'h4', meta);
        y = k.T(x, y + 6, w, 'body', bullets.join('\n'), { bullet: 'dot' }) + 16;
      };
      sec('Profile');
      y = k.T(x, y, w, 'body', 'Product manager with 7 years shipping analytics and workflow products for mid-market teams. I pair customer research with clear metrics, and I like small, fast teams that own their outcomes.');
      sec('Experience');
      role('**Senior Product Manager** · Northwind Analytics\tMar 2021 – Present', 'Remote  ·  Reporting & dashboards, 3 squads', [
        'Launched self-serve dashboards that grew weekly active accounts by **38%** in two quarters',
        'Set up continuous discovery: 120+ customer interviews a year feeding a shared insight library',
        'Cut onboarding time from 14 to **4 days** by redesigning setup with design and support',
        'Own pricing and packaging for the analytics add-on, now **18%** of new revenue']);
      role('**Product Manager** · Tailspin Software\tJun 2018 – Feb 2021', 'Seattle, WA  ·  Integrations platform', [
        'Shipped a public API and 25 integrations, now behind **$4.2M** in annual revenue',
        'Introduced quarterly OKRs and outcome-based roadmaps across 4 teams',
        'Partnered with sales on 30+ enterprise deals; cut churn of integration users by 9%']);
      role('**Associate Product Manager** · Contoso\tJul 2016 – May 2018', 'Redmond, WA', [
        'Ran 40+ A/B tests on sign-up and pricing pages, lifting paid conversion by 11%',
        'Wrote the first product analytics playbook, adopted by 6 teams']);
      sec('Skills');
      y = k.chips(x, y, w, ['Product discovery', 'Roadmapping', 'A/B testing', 'SQL', 'Amplitude', 'Figma', 'Jira', 'Stakeholder management', 'Pricing', 'API products'],
        { o: { color: '#0f766e', weight: 600 }, bg: '#e6f4f1', br: 10, px: 9, py: 3 });
      sec('Education');
      y = k.T(x, y, w, 'h3', '**BSc Cognitive Science** · University of California, Berkeley\t2012 – 2016');
      y = k.T(x, y + 2, w, 'h4', 'Minor in Data Science  ·  Dean’s List');
      sec('Certifications & Languages');
      y = k.T(x, y, w, 'body', '**Certified Scrum Product Owner** (CSPO)  ·  **Reforge** Product Strategy\n**Languages:** English (native), Mandarin (fluent)');
      sec('Volunteering');
      k.T(x, y, w, 'body', '**Mentor, Women in Product** (2020 – Present) — coached 12 career switchers into first PM roles');
    },
  },
  {
    id: 'executive', name: 'Executive', tags: ['1 column', 'ATS-safe', 'Senior'],
    desc: 'Navy, centred and formal, with a three-column competencies block. For directors and C-level.',
    margin: 54, palette: ['#1b2a4a', '#3d5a80', '#5a6a85', '#e9eef5', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'Merriweather', 22, 700, '#1b2a4a', { align: 'center', upper: true, ls: 0.8, lh: 1.2 }),
      h2: st('Heading 2 · Section', 'Merriweather', 10.5, 700, '#1b2a4a', { upper: true, ls: 0.4, lh: 1.25 }),
      h3: st('Heading 3 · Role / Degree', 'Source Sans 3', 11, 400, '#1b2a4a', { lh: 1.3 }),
      h4: st('Heading 4 · Dates / Meta', 'Source Sans 3', 10, 400, '#5a6a85', { italic: true }),
      body: st('Body text', 'Source Sans 3', 10.5, 400, '#2b2f36', { lh: 1.42 }),
      small: st('Small text', 'Source Sans 3', 9.5, 400, '#444b57', { lh: 1.4 }),
    },
    build(k) {
      const x = 54, w = TPL_W - 108;
      let y = k.T(x, 56, w, 'h1', 'Jonathan Reyes');
      y = k.T(x, y + 4, w, 'h4', 'Vice President, Global Operations', { o: { italic: false, upper: true, ls: 0.4, size: 10.5, weight: 600, color: '#3d5a80', align: 'center' } });
      y = k.T(x, y + 6, w, 'small', 'Chicago, IL  ·  jonathan.reyes@example.com  ·  +1 312 555 0187  ·  linkedin.com/in/jonathanreyes', { o: { align: 'center' } });
      y = k.L(x, y + 12, w, '#1b2a4a', 2) + 2; y = k.L(x, y, w, '#1b2a4a', 0.5);
      const sec = (title) => { y = k.T(x, y + 20, w, 'h2', title); y = k.L(x, y + 3, w, '#c5cfdd', 1) + 10; };
      sec('Executive Summary');
      y = k.T(x, y, w, 'body', 'Operations executive with 18 years leading manufacturing and supply-chain organisations of up to 2,400 people across North America and Europe. Delivered **$140M** in cost savings while lifting on-time delivery to 98%. Trusted partner to CEOs and boards on transformation, M&A integration and resilience.');
      sec('Core Competencies');
      const cw = (w - 24) / 3, comp = [
        ['Operational strategy', 'P&L ownership ($600M)', 'Lean & Six Sigma', 'Board reporting'],
        ['Supply-chain resilience', 'M&A integration', 'Capital planning', 'Change leadership'],
        ['ERP transformation', 'Labour relations', 'ESG & safety', 'Global sourcing'],
      ];
      y = Math.max(...comp.map((c, i) => k.T(x + i * (cw + 12), y, cw, 'body', c.join('\n'), { bullet: 'dot' })));
      sec('Professional Experience');
      const role = (t, meta, lead, bullets) => {
        y = k.T(x, y, w, 'h3', t); y = k.T(x, y + 1, w, 'h4', meta);
        if (lead) y = k.T(x, y + 4, w, 'body', lead);
        y = k.T(x, y + 5, w, 'body', bullets.join('\n'), { bullet: 'dot' }) + 14;
      };
      role('**Vice President, Global Operations** — Adventure Works Industries\t2018 – Present', 'Chicago, IL  ·  Reports to the CEO  ·  7 plants, 2,400 staff',
        'Lead manufacturing, procurement, logistics and quality for a $1.1B industrial-equipment business.', [
          'Delivered **$92M** in run-rate savings through network consolidation and strategic sourcing',
          'Raised on-time delivery from 81% to **98%** and cut inventory by $45M',
          'Integrated two acquisitions ($310M combined) ahead of plan with zero customer loss',
          'Built a 40-person operational-excellence office that now trains 300 leaders a year']);
      role('**Director of Operations** — Fabrikam Manufacturing\t2012 – 2018', 'Milwaukee, WI  ·  3 plants, 900 staff', '', [
        'Led an SAP S/4HANA roll-out across three sites on time and 8% under budget',
        'Cut recordable safety incidents by 64% through a site-wide safety programme',
        'Grew output 35% without new capital by redesigning shift patterns and maintenance']);
      role('**Plant Manager** — Contoso Components\t2006 – 2012', 'Detroit, MI', '', [
        'Turned around a loss-making plant to a 14% operating margin within two years',
        'Negotiated a five-year labour agreement with no lost production days']);
      sec('Education & Board');
      y = k.T(x, y, w, 'h3', '**MBA**, Kellogg School of Management, Northwestern University\t2010') + 3;
      y = k.T(x, y, w, 'h3', '**BSc Industrial Engineering**, Purdue University\t2002') + 3;
      k.T(x, y, w, 'h3', '**Board Member**, Midwest Manufacturing Council\t2020 – Present');
    },
  },
  {
    id: 'swiss', name: 'Swiss Grid', tags: ['Grid', 'ATS-safe', 'Design'],
    desc: 'Section labels in a left column, content on a strict grid, one red accent. For designers and creatives who want restraint.',
    margin: 56, palette: ['#111111', '#e4002b', '#6b6b6b', '#f2f2f2', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'Geist', 34, 700, '#111111', { ls: -1, lh: 1.05 }),
      h2: st('Heading 2 · Section', 'Geist', 9.5, 600, '#e4002b', { upper: true, ls: 0.35, lh: 1.35 }),
      h3: st('Heading 3 · Role / Degree', 'Geist', 10.5, 600, '#111111', { lh: 1.35 }),
      h4: st('Heading 4 · Dates / Meta', 'Geist', 9.5, 400, '#6b6b6b'),
      body: st('Body text', 'Geist', 9.5, 400, '#222222', { lh: 1.5 }),
      small: st('Small text', 'Geist', 9, 400, '#444444', { lh: 1.45 }),
    },
    build(k) {
      const x = 56, R = TPL_W - 56, cx = 216, cw = R - cx, lw = cx - x - 24;
      k.R(x, 48, R - x, 5, '#111111', { name: 'Top bar' });
      let y = k.T(x, 70, R - x, 'h1', 'Lena Fischer');
      y = k.T(x, y + 6, R - x, 'h3', 'Senior UX Designer', { o: { color: '#e4002b', size: 13 } });
      y = k.T(x, y + 10, R - x, 'small', 'lena.fischer@example.com    +49 30 1234 5678    lenafischer.design    Berlin, Germany') + 22;
      const sec = (label, fill) => {
        k.L(x, y, R - x, '#111111', 0.75);
        const top = y + 12;
        k.T(x, top, lw, 'h2', label);
        y = top; fill(); y += 24;
      };
      const role = (t, meta, text) => {
        y = k.T(cx, y, cw, 'h3', t); y = k.T(cx, y + 1, cw, 'h4', meta);
        y = k.T(cx, y + 6, cw, 'body', text, { bullet: text.includes('\n') ? 'dash' : 'none' }) + 16;
      };
      sec('Profile', () => {
        y = k.T(cx, y, cw, 'body', 'Designer with 8 years making complex software feel simple. I lead research-driven product design, build design systems that teams actually use, and care about accessibility as much as aesthetics.');
      });
      sec('Experience', () => {
        role('Lead Product Designer, Northwind Mobility\t2021 – Present', 'Berlin  ·  Booking app, 2M monthly users',
          'Redesigned the booking flow; completed bookings up **27%**\nBuilt the “Atlas” design system: 140 components used by 9 teams\nRaised the app to WCAG 2.2 AA across 60 screens\nLead a team of 5 designers and a design-ops specialist');
        role('Senior UX Designer, Fabrikam Health\t2018 – 2021', 'Munich  ·  Patient portal',
          'Ran 70+ usability sessions with patients and clinicians\nCut support tickets by 35% with a new appointment flow\nDesigned the clinician dashboard used in 120 practices');
        role('UX Designer, Studio Wingtip\t2016 – 2018', 'Hamburg  ·  Agency', 'Web and app projects for retail, travel and public-sector clients.');
        y -= 16;
      });
      sec('Selected Work', () => {
        y = k.T(cx, y, cw, 'body', '**Atlas Design System** — tokens, components and docs; adoption by 9 teams in 6 months\n**Clinic Finder** — finalist, German Design Award 2023\n**Night Trains** — concept app for European rail travel, 40k Dribbble views');
      });
      sec('Skills', () => {
        y = k.T(cx, y, cw, 'body', '**Research** — interviews, usability testing, journey mapping, surveys\n**Design** — interaction design, prototyping, design systems, accessibility\n**Tools** — Figma, FigJam, Maze, Framer, HTML & CSS');
      });
      sec('Education', () => {
        y = k.T(cx, y, cw, 'h3', 'BA Interaction Design, Köln International School of Design\t2012 – 2016');
        y = k.T(cx, y + 3, cw, 'h4', 'Languages: German (native), English (fluent), Spanish (basic)');
      });
      sec('Speaking', () => {
        y = k.T(cx, y, cw, 'body', '**Config 2024** — “Design systems that teams actually adopt”\n**UX Camp Berlin 2023** — Accessible booking flows');
      });
    },
  },
  {
    id: 'sidebar', name: 'Sidebar', tags: ['2 columns', 'Main column read first', 'Sans'],
    desc: 'Main story on the left, a tinted side column for skills, tools and languages. Great for tech and data roles.',
    margin: 36, palette: ['#0f172a', '#1e40af', '#64748b', '#eef2f8', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'Manrope', 27, 700, '#0f172a', { ls: -0.5, lh: 1.1 }),
      h2: st('Heading 2 · Section', 'Manrope', 10, 700, '#1e40af', { upper: true, ls: 0.4, lh: 1.25 }),
      h3: st('Heading 3 · Role / Degree', 'Manrope', 10.5, 700, '#0f172a', { lh: 1.35 }),
      h4: st('Heading 4 · Dates / Meta', 'Manrope', 9, 400, '#64748b'),
      body: st('Body text', 'Manrope', 10, 400, '#334155', { lh: 1.55 }),
      small: st('Small text', 'Manrope', 9.5, 400, '#334155', { lh: 1.6 }),
    },
    build(k) {
      const x = 48, mw = 470, sx = 572, sw = TPL_W - sx - 36;
      k.R(544, 0, TPL_W - 544, TPL_H, '#eef2f8', { name: 'Side column background' });
      let y = k.T(x, 52, mw, 'h1', 'Arjun Mehta');
      y = k.T(x, y + 5, mw, 'h3', 'Senior Data Scientist', { o: { color: '#1e40af', size: 12.5, weight: 600 } });
      y = k.T(x, y + 8, mw, 'small', ':mail: arjun.mehta@example.com   :phone: +1 646 555 0123\n:location: New York, NY   :github: github.com/arjunmehta   :linkedin: linkedin.com/in/arjunmehta', { ic: '#1e40af' }) + 6;
      const sec = (title, at = x, wd = mw) => { y = k.T(at, y + 22, wd, 'h2', title); y = k.L(at, y + 3, 28, '#1e40af', 2) + 10; };
      const role = (t, date, meta, bullets) => {
        y = k.T(x, y, mw, 'h3', t + '\t' + date); y = k.T(x, y + 1, mw, 'h4', meta);
        y = k.T(x, y + 6, mw, 'body', bullets.join('\n'), { bullet: 'dot' }) + 15;
      };
      sec('Profile');
      y = k.T(x, y, mw, 'body', 'Data scientist with 6 years turning messy data into models that ship. Experienced in forecasting, experimentation and ML in production; strong communicator with product and finance teams.');
      sec('Experience');
      role('Senior Data Scientist', '2022 – Now', 'Lumen Retail  ·  New York', [
        'Built a demand-forecasting model that cut stock-outs by **22%** across 1,300 stores',
        'Designed the experimentation platform used for 300+ tests a year',
        'Mentor 4 data scientists; run the team’s ML reading group']);
      role('Data Scientist', '2019 – 2022', 'Tailspin Insurance  ·  Boston', [
        'Shipped a claims-fraud model saving **$6.8M** a year at 92% precision',
        'Moved model training to Airflow and MLflow, from days to 3 hours',
        'Explained model decisions to regulators with SHAP-based reports']);
      role('Data Analyst', '2017 – 2019', 'Contoso Media  ·  Boston', [
        'Created the subscriber churn dashboard used in every weekly business review']);
      sec('Education');
      y = k.T(x, y, mw, 'h3', 'MS Data Science, Columbia University\t2017');
      y = k.T(x, y + 1, mw, 'h4', 'Thesis: Bayesian methods for sparse retail demand') + 6;
      y = k.T(x, y, mw, 'h3', 'BTech Computer Science, IIT Bombay\t2015');
      sec('Projects');
      k.T(x, y, mw, 'body', '**open-forecast** — Python library for hierarchical forecasting, 1.4k GitHub stars\n**Kaggle** — top 1% in the M5 forecasting competition', { bullet: 'dot' });
      // side column
      y = 34;
      const side = (title, text, extra) => { sec(title, sx, sw); y = k.T(sx, y, sw, 'small', text, extra) + 6; };
      side('Skills', 'Machine learning\nForecasting & time series\nA/B testing & causal inference\nNLP\nData visualisation\nStakeholder storytelling');
      sec('Tools', sx, sw);
      y = k.chips(sx, y, sw, ['Python', 'SQL', 'PyTorch', 'scikit-learn', 'Spark', 'dbt', 'Airflow', 'MLflow', 'AWS', 'Tableau'],
        { o: { color: '#1e40af', weight: 600 }, bg: '#ffffff', bw: 1, bd: '#c7d2e5', br: 6, px: 7, py: 2 }, 5) + 4;
      side('Languages', '**English** — fluent\n**Hindi** — native\n**Spanish** — conversational');
      side('Certifications', 'AWS Certified Machine Learning – Specialty\nGoogle Professional Data Engineer');
      side('Publications', '“Hierarchical forecasting at retail scale”, KDD Applied Data Science, 2023');
      side('Interests', 'Climbing, community data meetups, Hindi film music');
    },
  },
  {
    id: 'creative', name: 'Creative', tags: ['Photo', '2 columns', 'Bold header'],
    desc: 'A dark header with a photo, an elegant display face and coral accents. For brand, design and marketing roles.',
    margin: 48, palette: ['#1f1b2e', '#e2603f', '#6b6680', '#fcebe5', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'Playfair Display', 34, 700, '#1f1b2e', { lh: 1.1 }),
      h2: st('Heading 2 · Section', 'Playfair Display', 14, 700, '#1f1b2e', { lh: 1.2 }),
      h3: st('Heading 3 · Role / Degree', 'DM Sans', 10.5, 700, '#1f1b2e', { lh: 1.35 }),
      h4: st('Heading 4 · Dates / Meta', 'DM Sans', 9, 400, '#6b6680'),
      body: st('Body text', 'DM Sans', 9.5, 400, '#36324a', { lh: 1.5 }),
      small: st('Small text', 'DM Sans', 9, 400, '#36324a', { lh: 1.5 }),
    },
    build(k) {
      const x = 56, mw = 430, rx = 530, rw = TPL_W - rx - 50;
      k.R(0, 0, TPL_W, 206, '#1f1b2e', { name: 'Header band' });
      k.R(52, 39, 128, 128, '#e2603f', { shape: 'ellipse', name: 'Photo ring' });
      k.I(56, 43, 120, 120, AVATAR, { radius: 60, name: 'Photo' });
      let y = k.T(206, 52, TPL_W - 206 - 50, 'h1', 'Sofia Marín', { o: { color: '#ffffff' } });
      y = k.T(206, y + 4, TPL_W - 256, 'h4', 'Brand & Visual Designer', { o: { color: '#f19a80', upper: true, ls: 0.4, size: 10, weight: 700 } });
      k.T(206, y + 14, TPL_W - 256, 'small', ':mail: sofia.marin@example.com    :phone: +34 612 345 678\n:globe: sofiamarin.studio    :behance: behance.net/sofiamarin    :location: Barcelona', { o: { color: '#d8d3e6' }, ic: '#f19a80' });
      y = 236;
      const sec = (title, at, wd) => { y = k.T(at, y, wd, 'h2', title); y = k.L(at, y + 4, 26, '#e2603f', 2) + 10; };
      sec('Profile', x, mw);
      y = k.T(x, y, mw, 'body', 'Brand designer with 7 years building identities people remember — from first sketch to the full system. I lead workshops, art-direct photo and motion, and make guidelines teams love to use. Happiest where strategy meets craft.') + 20;
      sec('Experience', x, mw);
      const role = (t, date, meta, bullets) => {
        y = k.T(x, y, mw, 'h3', t + '\t' + date); y = k.T(x, y + 1, mw, 'h4', meta);
        y = k.T(x, y + 6, mw, 'body', bullets.join('\n'), { bullet: 'dot' }) + 16;
      };
      role('Senior Brand Designer', '2021 – Now', 'Studio Fabrikam  ·  Barcelona', [
        'Led 18 rebrands for hospitality, food and culture clients',
        'Rebrand for Mercat Nou lifted visits by **40%** in the first year',
        'Built a motion toolkit now used on every studio project',
        'Art-directed photo shoots and a team of 4 freelance illustrators']);
      role('Visual Designer', '2018 – 2021', 'Northwind Agency  ·  Madrid', [
        'Designed campaigns for 3 national retail brands (TV, OOH, social)',
        'Introduced a shared asset library that halved production time',
        'Designed packaging for a 24-product private-label food range']);
      role('Junior Designer', '2017 – 2018', 'Wingtip Press  ·  Valencia', [
        'Editorial layouts for a monthly culture magazine (60k print run)',
        'Redesigned the magazine’s cover system and type hierarchy']);
      y += 7;
      sec('Selected Clients', x, mw);
      k.T(x, y, mw, 'body', 'Mercat Nou · Casa Lumen · Teatre del Port · Olivé Coffee · Barcelona Design Week · Fundació Arc');
      // right column
      y = 236;
      sec('Skills', rx, rw);
      y = k.chips(rx, y, rw, ['Brand identity', 'Art direction', 'Typography', 'Packaging', 'Motion', 'Illustration', 'Workshops'],
        { o: { color: '#b4442a', weight: 700 }, bg: '#fcebe5', br: 10, px: 9, py: 3 }, 6) + 22;
      sec('Tools', rx, rw);
      y = k.T(rx, y, rw, 'small', 'Figma · Illustrator · Photoshop · InDesign · After Effects · Blender') + 22;
      sec('Education', rx, rw);
      y = k.T(rx, y, rw, 'h3', 'BA Graphic Design');
      y = k.T(rx, y + 1, rw, 'h4', 'Elisava, Barcelona · 2013 – 2017') + 22;
      sec('Recognition', rx, rw);
      y = k.T(rx, y, rw, 'small', '**Laus Award**, Gold — 2023\n**Brand New**, Noted — 2022\n**ADCE**, Shortlist — 2021') + 22;
      sec('Languages', rx, rw);
      y = k.T(rx, y, rw, 'small', 'Spanish, Catalan — native\nEnglish — fluent\nItalian — intermediate') + 22;
      sec('Interests', rx, rw);
      k.T(rx, y, rw, 'small', 'Risograph printing, ceramics, Sunday markets');
    },
  },
  {
    id: 'compact', name: 'Compact Tech', tags: ['1 column', 'ATS-safe', 'Dense'],
    desc: 'Dense, scannable and one page: skills up top, four roles, projects. Built for software engineers.',
    margin: 40, palette: ['#111827', '#2563eb', '#6b7280', '#e5e7eb', '#ffffff'],
    styles: {
      h1: st('Heading 1 · Name', 'Roboto', 22, 700, '#111827', { lh: 1.1 }),
      h2: st('Heading 2 · Section', 'Roboto', 10, 700, '#2563eb', { upper: true, ls: 0.4, lh: 1.2 }),
      h3: st('Heading 3 · Role / Degree', 'Roboto', 10, 400, '#111827', { lh: 1.35 }),
      h4: st('Heading 4 · Dates / Meta', 'Roboto', 9, 400, '#6b7280', { italic: true }),
      body: st('Body text', 'Roboto', 9.5, 400, '#1f2937', { lh: 1.42 }),
      small: st('Small text', 'Roboto', 8.5, 400, '#374151', { lh: 1.4 }),
    },
    build(k) {
      const x = 44, w = TPL_W - 88;
      let y = k.T(x, 40, w, 'h1', 'Daniel Kowalski');
      y = k.T(x, y + 3, w, 'h3', 'Senior Software Engineer  ·  Backend & distributed systems', { o: { color: '#2563eb', weight: 600 } });
      y = k.T(x, y + 5, w, 'small', ':mail: daniel.kowalski@example.com   :phone: +48 512 345 678   :location: Warsaw, Poland   :github: github.com/dkowalski   :linkedin: linkedin.com/in/dkowalski', { ic: '#2563eb' });
      const sec = (title) => { y = k.T(x, y + 16, w, 'h2', title); y = k.L(x, y + 3, w, '#d1d5db', 0.75) + 8; };
      const role = (t, meta, bullets) => {
        y = k.T(x, y, w, 'h3', t); y = k.T(x, y, w, 'h4', meta);
        y = k.T(x, y + 3, w, 'body', bullets.join('\n'), { bullet: 'dot' }) + 10;
      };
      sec('Summary');
      y = k.T(x, y, w, 'body', 'Backend engineer with 9 years building high-throughput services in Go and Java. Comfortable owning systems end to end — design, on-call and cost. Looking for a staff-level role on a platform team.');
      sec('Skills');
      y = k.T(x, y, w, 'body', '**Languages:** Go, Java, Kotlin, Python, SQL\n**Systems:** Kafka, PostgreSQL, Redis, gRPC, Kubernetes, Terraform\n**Cloud & tools:** AWS, GCP, Prometheus, Grafana, GitHub Actions');
      sec('Experience');
      role('**Senior Software Engineer** — Northwind Payments\tJan 2021 – Present', 'Warsaw · Payments platform', [
        'Designed an idempotent payments ledger handling **18k tx/s** at 99.99% availability',
        'Cut p99 latency of the authorisation API from 420 ms to **95 ms**',
        'Led the move from a monolith to 12 services with zero-downtime migrations',
        'Reduced cloud spend by **31%** ($1.2M a year) with autoscaling and storage tiering',
        'Mentor 3 engineers; run the backend guild and the on-call review']);
      role('**Software Engineer** — Tailspin Logistics\tMar 2018 – Dec 2020', 'Kraków · Routing team', [
        'Built a route-optimisation service that saved 9% fuel across 3,000 vehicles',
        'Introduced contract testing; production incidents fell by 40%',
        'Built the event pipeline (Kafka, 2B events/day) behind real-time tracking']);
      role('**Software Engineer** — Contoso Cloud\tJul 2016 – Feb 2018', 'Warsaw · Storage', [
        'Implemented S3-compatible multipart uploads in Java; 2 PB stored in year one',
        'Wrote the load-testing harness still used for every storage release']);
      role('**Junior Developer** — Adventure Works\tSep 2015 – Jun 2016', 'Wrocław', [
        'Maintained internal tools in Python and Django']);
      sec('Projects');
      y = k.T(x, y, w, 'body', '**ratelimit-go** — distributed rate limiter, 2.1k GitHub stars, used in production by 30+ companies\n**pgmigrate** — safe online schema migrations for PostgreSQL; talk at GopherCon EU 2023\n**Advent of Code** — solutions in Go with benchmarks, used in a university course', { bullet: 'dot' });
      sec('Education');
      y = k.T(x, y, w, 'h3', '**MSc Computer Science** — Warsaw University of Technology\t2010 – 2015');
      y = k.T(x, y + 1, w, 'h4', 'Thesis: Consistent hashing for geo-distributed caches');
      sec('Certifications & Languages');
      k.T(x, y, w, 'body', '**AWS Certified Solutions Architect – Professional**  ·  **CKA** (Certified Kubernetes Administrator)\n**Languages:** Polish (native), English (C1), German (B1)');
    },
  },
];

// Build a template into a full document (fonts loaded first so every text box is measured in its real font).
const builtTemplates = {};
async function buildTemplate(t) {
  if (builtTemplates[t.id]) return builtTemplates[t.id];
  const fams = [...new Set(Object.values(t.styles).map((s) => s.font))];
  await Promise.all(fams.flatMap((f) => ['400', '600', '700', 'italic 400', 'italic 700'].map((w) => document.fonts.load(`${w} 16px "${f}"`).catch(() => null))));
  const d = normalize({ name: 'My CV', size: 'A4', margin: t.margin, palette: t.palette, styles: t.styles, pages: [{ els: [] }] });
  const saved = doc; doc = d; // the measuring uses the normal renderer, which reads the global document
  const k = tplKit(d);
  try { t.build(k); } finally { k.done(); doc = saved; }
  builtTemplates[t.id] = d;
  return d;
}
function applyTemplate(d) {
  const copy = clone(d), groups = {};
  copy.pages.forEach((p) => p.els.forEach((e) => { e.id = uid(); if (e.g) e.g = groups[e.g] ||= uid(); }));
  openDoc(copy);
  $('#tplDialog').close();
  setStatus('New document in its own tab – double-click any text to make it yours.', 7000);
}

// A scaled, live preview of a document: the same renderer as the editor.
function previewSheet(d) {
  const saved = doc; doc = d;
  const pg = h('div', { class: 'page' });
  Object.assign(pg.style, { width: TPL_W + 'px', height: TPL_H + 'px' });
  try { d.pages[0].els.forEach((e) => pg.appendChild(buildNode(e))); } finally { doc = saved; }
  return pg;
}

async function openTemplates() {
  const grid = $('#tplGrid'), dlg = $('#tplDialog');
  grid.replaceChildren(h('p', { class: 'tpl-loading', textContent: 'Loading templates…' }));
  if (!dlg.open) dlg.showModal();
  const cards = [];
  const blank = h('button', { class: 'tpl', onclick: () => { openDoc(newDoc()); dlg.close(); } },
    h('div', { class: 'tpl-sheet tpl-blank' }, uiIcon('new')),
    h('div', { class: 'tpl-name', textContent: 'Blank page' }),
    h('div', { class: 'tpl-desc', textContent: 'An empty A4 page with the default text styles.' }));
  cards.push(blank);
  for (const t of TEMPLATES) {
    let d;
    try { d = await buildTemplate(t); } catch (err) { console.error(err); continue; }
    const sheet = h('div', { class: 'tpl-sheet' }, previewSheet(d));
    cards.push(h('button', { class: 'tpl', title: `Use the ${t.name} template`, onclick: () => applyTemplate(d) },
      sheet,
      h('div', { class: 'tpl-name', textContent: t.name }),
      h('div', { class: 'tpl-desc', textContent: t.desc }),
      h('div', { class: 'tpl-tags' }, t.tags.map((x) => h('span', { textContent: x })))));
  }
  grid.replaceChildren(...cards);
  const fit = () => grid.querySelectorAll('.tpl-sheet .page').forEach((pg) => { pg.style.transform = `scale(${pg.parentElement.clientWidth / TPL_W})`; });
  fit(); requestAnimationFrame(fit);
}
window.addEventListener('resize', () => { if ($('#tplDialog').open) $('#tplGrid').querySelectorAll('.tpl-sheet .page').forEach((pg) => { pg.style.transform = `scale(${pg.parentElement.clientWidth / TPL_W})`; }); });

$('#btnTemplates').onclick = openTemplates;
$('#btnNew').onclick = openTemplates;
$('#tabNew').onclick = openTemplates;
$('#tplOpen').onclick = () => { $('#tplDialog').close(); $('#fileOpen').click(); };
$('#tplClose').onclick = () => $('#tplDialog').close();
