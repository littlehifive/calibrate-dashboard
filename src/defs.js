// What every number on the page means and how it is calculated. One source for the (i) popovers
// and the "How the numbers work" section, so the two can never drift apart.
// Fields: title, what (plain meaning), formula (HTML), counted (what goes in), read (how to read it).
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  const DEFS = {
    majority: {
      title: 'Majority',
      what: 'The answer most people gave, among the people counted under "Majority from" who answered. The tally next to it, such as 3/4, shows how many of them gave it. A 2-1-1 pattern still has a majority of 2.',
      read: 'When the top two answers get the same number of votes there is no majority, and the cell shows "Tie". With fewer than 2 answers it shows a dash. An answer that differs from the majority has a dark outline and a ≠ mark.',
    },
    split: {
      title: 'Tie (no majority)',
      what: 'The two most common answers got the same number of votes, for example 2 Yes and 2 No. There is no majority, so nobody is marked as off the majority for that question.',
    },
    thin: {
      title: 'Too few answers',
      what: 'Fewer than 2 people answered (common on optional questions). Agreement needs at least two answers, so these are left out.',
    },
    off: {
      title: 'Off the majority (≠)',
      what: 'The person picked a different answer from the majority. The ≠ mark and a dark outline show it on their answer.',
    },
    grouped: {
      title: 'Answers: Yes vs. anything else',
      what: 'With this setting, every answer except the first option (usually Yes) counts as the same answer. Use it when what matters is whether the response met the standard, not why it fell short. Questions with only two options are left as they are.',
    },
    settings: {
      title: 'The two settings',
      what: '"Majority from: Experts only" compares everyone, the AI included, with the majority answer of the experts. "Experts + AI" lets the AI\'s answer count toward the majority as one more vote. "Answers: As chosen" compares the exact options; "Yes vs. anything else" folds every other option together. Both settings change every number on the Overview and Review pages.',
    },
    conversations: {
      title: 'Conversations',
      what: 'Rows in the file you opened. Each row is one conversation the experts rated.',
    },
    conflicts: {
      title: 'Conversations with a conflict',
      what: 'Conversations where, on at least one question, the answers tied or someone counted in the majority gave a different answer. With "Majority from: Experts only", the AI disagreeing on its own does not count as a conflict; with "Experts + AI" it does.',
      formula: 'conversations with at least one tie or off-majority answer ÷ all conversations',
    },
    reliable: {
      title: 'Questions with reliable agreement',
      what: 'Questions where the experts\' Krippendorff\'s alpha is 0.80 or higher, the level Krippendorff suggests for data you can rely on.',
    },
    aiPooled: {
      title: 'AI matches the expert majority, all questions',
      what: 'How often the AI evaluator gave the experts\' majority answer, adding up every question.',
      formula: 'Σ matches ÷ Σ conversations with an expert majority and an AI answer (summed over questions)',
    },
    recorded: {
      title: 'Decisions submitted',
      what: 'Conversations with a conflict where the group\'s decision has been submitted on the Review page. Drafts that were not submitted yet do not count.',
    },
    unanimous: {
      title: 'Experts unanimous',
      what: 'How often every expert who answered picked the same option.',
      formula: 'U ÷ N',
      counted: 'N = conversations where at least 2 experts answered. U = the ones where all of their answers match.',
      read: '100% means no expert ever disagreed on this question.',
    },
    pairwise: {
      title: 'Expert pairwise agreement',
      what: 'Take every pair of experts and work out how often the two gave the same answer. Then average over the pairs.',
      formula: 'average over all pairs (a, b) of: same(a, b) ÷ both(a, b)',
      counted: 'both(a, b) = conversations both experts answered; same(a, b) = the ones where they picked the same option. With k experts there are k(k − 1) ÷ 2 pairs, so 6 pairs for 4 experts.',
      read: 'Easy to read, but it ignores chance: two people who both say Yes 90% of the time will agree a lot just by luck. Alpha corrects for that.',
    },
    alpha: {
      title: 'Krippendorff\'s alpha (α), experts',
      what: 'Agreement corrected for chance. It compares how often the answers disagree with how often they would disagree if people picked options at random in the same proportions.',
      formula: 'α = 1 − D<sub>o</sub> ÷ D<sub>e</sub><br>&nbsp;&nbsp;= 1 − (n − 1) × Σ<sub>c≠k</sub> o<sub>ck</sub> ÷ Σ<sub>c≠k</sub> n<sub>c</sub>·n<sub>k</sub>',
      counted: 'Build a table o of answer pairs: in each conversation with m ≥ 2 answers, every ordered pair of answers (c, k) from two different people adds 1 ÷ (m − 1) to o<sub>ck</sub>. n<sub>c</sub> is the total of row c and n the grand total. D<sub>o</sub> is the observed disagreement, D<sub>e</sub> the disagreement expected by chance. Answers are treated as categories, and skipped answers are left out.',
      read: '1 = perfect agreement, 0 = no better than chance, below 0 = worse than chance. Krippendorff suggests 0.80 or more for reliable data and 0.667 to 0.80 for tentative conclusions. With a few dozen conversations, treat the value as rough.',
    },
    alphaAll: {
      title: 'Alpha, experts + AI',
      what: 'The same alpha with the AI evaluator added as one more rater.',
      read: 'If it is close to the experts-only alpha, the AI fits in about as well as another expert would. If it drops, the AI disagrees with the group more than the experts disagree with each other.',
    },
    aiMaj: {
      title: 'AI matches the expert majority',
      what: 'How often the AI evaluator gave the same answer as the experts\' majority.',
      formula: 'A ÷ M',
      counted: 'M = conversations where the experts had a majority (at least 2 answered, no tie) and the AI answered. A = the ones where the AI gave the majority answer.',
      read: 'This always uses the experts-only majority, whatever "Majority from" is set to.',
    },
    ties: {
      title: 'Ties',
      what: 'Conversations where the two most common answers got the same number of votes, among the people counted under "Majority from". The number in brackets counts conversations where fewer than 2 people answered.',
    },
    answered: {
      title: 'Answers per person',
      what: 'How many conversations each person answered for this question. People can skip optional questions, so these can differ.',
    },
    offMajority: {
      title: 'Who is off the majority',
      what: 'For each person and question: k ÷ n.',
      formula: 'k ÷ n',
      counted: 'k = conversations where the person\'s answer differed from the majority. n = conversations where there was a majority and the person answered. Conversations with a tie, with fewer than 2 answers, or that the person skipped are left out of n. That is why the denominators differ from cell to cell.',
      read: 'A stronger colour = a larger share off the majority. In "Experts only" mode an expert\'s own answer is part of the majority they are compared with, so it is harder for one expert to end up off it than for the AI. Switch to "Experts + AI" for an even comparison.',
    },
    pairPct: {
      title: 'Pairwise agreement, % same answer',
      what: 'For two people: how often they picked exactly the same option.',
      formula: 'same ÷ both',
      counted: 'both = conversations both people answered; same = the ones where they picked the same option. "All questions" adds up same and both across questions before dividing.',
      read: 'This is agreement, not a correlation: it only asks whether the two picked the identical option. A stronger colour = more agreement.',
    },
    kappa: {
      title: 'Pairwise agreement, Cohen\'s kappa (κ)',
      what: 'Agreement between two people, corrected for the agreement you would expect by chance from how often each of them uses each option.',
      formula: 'κ = (p<sub>o</sub> − p<sub>e</sub>) ÷ (1 − p<sub>e</sub>)',
      counted: 'Over the conversations both answered: p<sub>o</sub> = share where they picked the same option. p<sub>e</sub> = Σ over options of (share of A\'s answers that were that option × share of B\'s answers that were that option).',
      read: '1 = perfect, 0 = what chance would give, below 0 = worse than chance. A stronger colour = more agreement. Left blank when both people always gave the same single answer, because chance agreement is then 100%.',
    },
    usage: {
      title: 'How each person used the options',
      what: 'The share of conversations each person rated with each option. Someone who never answers No, or almost always answers Yes, stands out here.',
    },
  };

  // Krippendorff's thresholds, as plain words.
  function alphaWord(a) { return a == null ? '' : a >= 0.8 ? 'reliable' : a >= 0.667 ? 'tentative' : 'low'; }

  const api = { DEFS, alphaWord };
  CD.defs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
