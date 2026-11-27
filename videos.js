/*
 * WANDERSPACE — the watch list.
 * Add a video = add one object below. Nothing else needs to change.
 *
 *   id      YouTube video id (the bit after ?v=)
 *   title   as shown on YouTube
 *   by      channel / creator
 *   secs    length in seconds. Use null if you don't know it yet.
 *   check   'checked' = length confirmed from a source
 *           'est'     = my best estimate (the app re-measures the real length
 *                       in your browser once the page is served over http/https)
 *   themes  any of: existentialism, mortality, stoicism, meaning, identity, absurd, evil, love
 *   blurb   one neutral line about the idea (not a claim about the video's script)
 *   ask     the question to carry through the day
 *
 * HARD RULE: a video is only ever *recommended* if its length is known and
 * <= 25 minutes. `secs: null` videos stay on the shelf but out of the daily /
 * refresh rotation until the app has measured them and they pass.
 *
 * Every id below was looked up against YouTube's own metadata (oEmbed) on
 * 2026-11-26 — the title and channel match what is listed here.
 */
window.WANDERSPACE_VIDEOS = [
  // ── your references ──────────────────────────────────────────────────────
  {
    id: 'QFD96No33mw', title: "What if you're not special at all?", by: 'Alastair',
    secs: 650, check: 'est', themes: ['identity', 'meaning'],
    blurb: 'A video essay on being ordinary, and whether a life has to be exceptional to be worth living.',
    ask: 'If you stopped trying to be exceptional, what would you spend your life doing?'
  },
  {
    id: 'ikPsDN4-uF0', title: 'My Favorite Depictions of Death', by: 'Final Somow',
    secs: null, check: null, themes: ['mortality'],
    blurb: 'One of your reference videos: a video essay on how death gets depicted.',
    ask: 'How do you picture death, and where did that picture come from?'
  },
  {
    id: 'Yb-U-v6UqY0', title: 'My Favorite Depictions of Death', by: 'Pancake',
    secs: null, check: null, themes: ['mortality'],
    blurb: 'One of your reference videos: another take on depictions of death.',
    ask: 'Which story about death has stayed with you the longest, and why that one?'
  },
  {
    id: 'et5F7rFOAo0', title: 'Le biais qui te rend plus attachant', by: 'Gnooki', lang: 'FR',
    secs: null, check: null, themes: ['identity'],
    blurb: 'One of your reference videos (in French): a psychological bias that makes people more endearing.',
    ask: 'When did someone showing a flaw make them feel closer to you?'
  },

  // ── more Alastair ────────────────────────────────────────────────────────
  {
    id: '34sA9K8_cLM', title: 'The cost of becoming yourself', by: 'Alastair',
    secs: 540, check: 'est', themes: ['identity', 'meaning'],
    blurb: 'A video essay on what it costs to become the person you actually are.',
    ask: 'What would you be willing to give up in order to become more yourself?'
  },
  {
    id: 'D5iywwlhRUA', title: 'The fear of enjoying your life', by: 'Alastair',
    secs: 500, check: 'est', themes: ['meaning', 'identity'],
    blurb: 'A video essay on why enjoying your life can feel like a risk.',
    ask: 'What are you waiting to achieve before you let yourself enjoy the present?'
  },

  // ── existentialism & the absurd ──────────────────────────────────────────
  {
    id: 'vyZK8rkeqPM', title: 'Sisyphus (1974)', by: 'Marcell Jankovics',
    secs: 150, check: 'est', themes: ['absurd', 'existentialism'],
    blurb: "Jankovics' Oscar-nominated animation of the myth Camus turned into the symbol of the absurd.",
    ask: 'What boulder are you pushing, and did you choose it?'
  },
  // ── mortality ────────────────────────────────────────────────────────────
  {
    id: 'aQ5upMz0_ig', title: 'Alan Watts – Think of Nothing', by: '44connected',
    secs: 240, check: 'est', themes: ['mortality', 'meaning'],
    blurb: 'An animation set to Alan Watts on what death might be like, and the oddness of non-existence.',
    ask: 'What do you imagine non-existence to be, and does that change how you spend today?'
  },
  // ── meaning & the good life ──────────────────────────────────────────────
  {
    id: 'khOaAHK7efc', title: 'What If Money Was No Object? – Alan Watts', by: 'T&H – Inspiration & Motivation',
    secs: 210, check: 'est', themes: ['meaning'],
    blurb: "Alan Watts asks what you'd do with your life if money weren't the point.",
    ask: "If money weren't a factor, what would you spend a year doing?"
  },
  // ── stoicism ─────────────────────────────────────────────────────────────,

  // ── added from your list: stories, characters, symbolism ─────────────────
  {
    id: 'IVTyVuRw340', title: 'Why Time Heals All Wounds', by: 'Boklosophy',
    secs: null, check: null, themes: ['meaning', 'identity'],
    blurb: 'A video essay on why time heals, and what actually changes while it does.',
    ask: 'What are you waiting for time to do that only you can do?'
  },
  {
    id: 'jTRnBwCXptI', title: 'The cure to feeling lost in life', by: 'Verse Creates',
    secs: null, check: null, themes: ['meaning', 'identity'],
    blurb: 'A video essay on feeling lost and what might end it.',
    ask: 'If you stopped looking for the answer, what would you do tomorrow?'
  },
  {
    id: 'THrsWNBIXqo', title: 'The Happiness of the Pursuit', by: 'imdanjo',
    secs: null, check: null, themes: ['meaning'],
    blurb: 'A video essay on finding happiness in the chase rather than the arrival.',
    ask: 'What are you pursuing right now that you would miss if you caught it?'
  },
  {
    id: 'OHlRzhjjfp0', title: 'What Happens When the VILLAIN Wins?', by: 'scrawls',
    secs: null, check: null, themes: ['evil', 'meaning'],
    blurb: 'A video essay on stories where the villain wins.',
    ask: 'What would the story you are in look like if the villain won?'
  },
  {
    id: 'JMtomav6tjo', title: '"What Happens When the VILLAIN is Right?"', by: 'scrawls',
    secs: null, check: null, themes: ['evil', 'identity'],
    blurb: 'A video essay on villains who have a point.',
    ask: 'When did someone you disagreed with turn out to be partly right?'
  },
  {
    id: 'udYWLf4iHF4', title: 'The Exhaustion of Trying to Make Life Meaningful', by: "Apollo's Journal",
    secs: null, check: null, themes: ['meaning', 'absurd'],
    blurb: 'A video essay on how tiring it is to keep making life mean something.',
    ask: 'What would you let go of if life did not have to be meaningful?'
  },
  {
    id: 'm4XhrIjfDdA', title: 'Why Evil Is Necessary', by: 'Kaze',
    secs: null, check: null, themes: ['evil', 'meaning'],
    blurb: 'A video essay on the role evil plays in stories and in life.',
    ask: 'What good in your life only exists because of something bad?'
  },
  {
    id: 'OFu_dZpNjl0', title: 'Greatness Is Actually Simple', by: 'Kaze',
    secs: null, check: null, themes: ['meaning', 'identity'],
    blurb: 'A video essay on what greatness is made of.',
    ask: 'What is the simplest version of what you are trying to become?'
  },
  {
    id: 'pt7RDtHZQoU', title: 'The Mind of a Genius', by: 'Bygone Philosophy',
    secs: null, check: null, themes: ['identity'],
    blurb: 'A video essay on the mind of a genius.',
    ask: 'What would you be doing if you stopped comparing yourself to the best?'
  },
  {
    id: '8Krn_7GltBY', title: 'love cannot fix you', by: 'Sisyphus 55',
    secs: null, check: null, themes: ['love', 'identity'],
    blurb: 'A video essay on love and what it can and cannot repair.',
    ask: 'What are you hoping someone else will fix in you?'
  },
  {
    id: "QueomCKYr-8",
    title: "This found you for a reason.",
    by: "Alastair",
    secs: 251,
    check: "checked",
    themes: ["meaning"],
    blurb: "There’s no rush to have it all figured out",
    ask: "What would you keep if you stopped trying to be impressive?",
    lang: "en"
  },
  {
    id: "L7ZE2rpkoeA",
    title: "Offline is the new luxury",
    by: "Alastair",
    secs: 372,
    check: "checked",
    themes: ["meaning"],
    blurb: "Unplugging from the noise and finding clarity in the quiet, stepping away from the chaos to reconnect with what matters",
    ask: "What would you keep if you stopped trying to be impressive?",
    lang: "en"
  }
];
