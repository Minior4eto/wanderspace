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
 *   themes  any of: existentialism, mortality, stoicism, meaning, identity, absurd
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
    id: 'MBRqu0YOH14', title: 'Optimistic Nihilism', by: 'Kurzgesagt – In a Nutshell',
    secs: 446, check: 'checked', themes: ['meaning', 'absurd'],
    blurb: "Kurzgesagt's answer to existential dread: if nothing is written in the stars, you get to write it.",
    ask: 'If nothing is pre-written, what do you want to build with your time?'
  },
  {
    id: 'vPtzpjC7TF4', title: 'Is life meaningless? And other absurd questions', by: 'TED-Ed',
    secs: 330, check: 'est', themes: ['absurd', 'meaning', 'existentialism'],
    blurb: "A short introduction to Camus: the absurd, and why he thought revolt beats resignation.",
    ask: 'What would still make life worth living without a grand explanation?'
  },
  {
    id: 'jQOfbObFOCw', title: 'PHILOSOPHY – Albert Camus', by: 'The School of Life',
    secs: 480, check: 'est', themes: ['absurd', 'existentialism', 'meaning'],
    blurb: 'Camus on the gap between our hunger for meaning and a silent universe.',
    ask: 'Which part of your routine would you keep if you decided to find it meaningful?'
  },
  {
    id: 'vyZK8rkeqPM', title: 'Sisyphus (1974)', by: 'Marcell Jankovics',
    secs: 150, check: 'est', themes: ['absurd', 'existentialism'],
    blurb: "Jankovics' Oscar-nominated animation of the myth Camus turned into the symbol of the absurd.",
    ask: 'What boulder are you pushing, and did you choose it?'
  },
  {
    id: 'D9JCwkx558o', title: 'PHILOSOPHY – Søren Kierkegaard', by: 'The School of Life',
    secs: 440, check: 'est', themes: ['existentialism', 'identity'],
    blurb: 'Kierkegaard on anxiety, freedom, and the fact that every real choice closes other doors.',
    ask: 'Which possibility are you keeping alive by refusing to choose?'
  },
  {
    id: '3bQsZxDQgzU', title: 'PHILOSOPHY – Sartre', by: 'The School of Life',
    secs: 480, check: 'est', themes: ['existentialism', 'identity'],
    blurb: 'Sartre on freedom and responsibility: we are not handed a finished identity, we make one.',
    ask: 'Where are you treating a role or a habit as if it were your whole identity?'
  },
  {
    id: 'Br1sGrA7XTU', title: 'PHILOSOPHY – Heidegger', by: 'The School of Life',
    secs: 480, check: 'est', themes: ['existentialism', 'meaning'],
    blurb: "Heidegger's attempt to wake us up to the strangeness of being here at all.",
    ask: 'What have you stopped noticing simply because it is always there?'
  },

  // ── mortality ────────────────────────────────────────────────────────────
  {
    id: 'aQ5upMz0_ig', title: 'Alan Watts – Think of Nothing', by: '44connected',
    secs: 240, check: 'est', themes: ['mortality', 'meaning'],
    blurb: 'An animation set to Alan Watts on what death might be like, and the oddness of non-existence.',
    ask: 'What do you imagine non-existence to be, and does that change how you spend today?'
  },
  {
    id: 'E5f5smh7Keo', title: "PHILOSOPHY – History: Epicurus' Cure for Unhappiness", by: 'Wireless Philosophy',
    secs: 420, check: 'est', themes: ['mortality', 'meaning', 'stoicism'],
    blurb: "Epicurus' four-part cure for unhappiness, including why death is nothing to worry about.",
    ask: 'Which fear on your list loses its force when you say it out loud?'
  },

  // ── meaning & the good life ──────────────────────────────────────────────
  {
    id: 'khOaAHK7efc', title: 'What If Money Was No Object? – Alan Watts', by: 'T&H – Inspiration & Motivation',
    secs: 210, check: 'est', themes: ['meaning'],
    blurb: "Alan Watts asks what you'd do with your life if money weren't the point.",
    ask: "If money weren't a factor, what would you spend a year doing?"
  },
  {
    id: 'j_7deR0idvs', title: "Aristotle on 'Flourishing'", by: 'BBC Radio 4',
    secs: 300, check: 'est', themes: ['meaning'],
    blurb: "Aristotle's idea of a good life as flourishing, not just feeling good.",
    ask: 'What would flourishing look like for you this year, apart from comfort?'
  },
  {
    id: '-oJs5u_GAYA', title: 'PHILOSOPHY – The Good Life: Plato', by: 'Wireless Philosophy',
    secs: 420, check: 'est', themes: ['meaning'],
    blurb: "Plato's answer to what makes a life good.",
    ask: 'Which of your desires are you in charge of, and which are in charge of you?'
  },

  // ── stoicism ─────────────────────────────────────────────────────────────
  {
    id: 'R9OCA6UFE-0', title: 'The philosophy of Stoicism – Massimo Pigliucci', by: 'TED-Ed',
    secs: 330, check: 'checked', themes: ['stoicism'],
    blurb: 'A five-minute tour of Stoicism: what is up to us, what is not, and how to live well anyway.',
    ask: 'What are you worrying about today that is genuinely outside your control?'
  },
  {
    id: 'yu7n0XzqtfA', title: 'PHILOSOPHY – The Stoics', by: 'The School of Life',
    secs: 540, check: 'est', themes: ['stoicism'],
    blurb: 'Alain de Botton on the Stoics and their practical training in calm.',
    ask: 'What is one thing you could meet with calm today instead of complaint?'
  },
  {
    id: 'r7zThgJAAPg', title: 'How Marcus Aurelius Stayed Calm in Chaos | 3 Stoic Methods', by: 'Einzelgänger',
    secs: 720, check: 'est', themes: ['stoicism'],
    blurb: 'A Marcus Aurelius essay on staying steady when everything around you is not.',
    ask: 'Which of the three kinds of chaos in your life is actually yours to fix?'
  },
  {
    id: 'LGXRpbDuDGE', title: 'When Life Hurts, Care Less About It | The Philosophy of Marcus Aurelius', by: 'Einzelgänger',
    secs: 720, check: 'est', themes: ['stoicism', 'meaning'],
    blurb: 'A Marcus Aurelius essay on how much weight we give to the things that hurt us.',
    ask: 'What are you giving more weight than it deserves?'
  },
  {
    id: 'bgL9z3Sexz8', title: 'Nothing Can Hurt You Without Your Permission | Stoic Philosophy', by: 'Einzelgänger',
    secs: 720, check: 'est', themes: ['stoicism'],
    blurb: 'A Stoic essay on the gap between what happens to you and how you take it.',
    ask: 'Where could you pause between what happened and how you respond?'
  },
  {
    id: 'Tkaheggogm0', title: '"Let Them Scream Whatever They Want" | How Stoics Deal With Panic', by: 'Einzelgänger',
    secs: 720, check: 'est', themes: ['stoicism'],
    blurb: 'A Stoic essay on keeping your head when other people are losing theirs.',
    ask: "Whose panic have you been absorbing that was never yours?"
  },
  {
    id: 'KDsdLKDHIWI', title: "The Problem Isn't Life, It's Your Expectations | Stoicism", by: 'Einzelgänger',
    secs: 720, check: 'est', themes: ['stoicism', 'meaning'],
    blurb: 'A Stoic essay on how much of our frustration comes from what we expected.',
    ask: 'Which expectation, if you let it go today, would make the day lighter?'
  },
  {
    id: 'TNg4tXG5XNw', title: 'Don’t Be “Distracted by Their Darkness” | Marcus Aurelius on Success', by: 'Einzelgänger',
    secs: 720, check: 'est', themes: ['stoicism', 'identity'],
    blurb: 'A Marcus Aurelius essay on success and staying clear of other people’s noise.',
    ask: 'Whose opinion of your life are you still performing for?'
  }
];
