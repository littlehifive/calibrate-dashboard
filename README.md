# calibrate-dashboard

This page turns the items CSV from a Calibrate annotation task into a rater-agreement dashboard. Experts can then record what they decide about each conflict.

It runs entirely in the browser. The CSV is never uploaded anywhere, and the page's content security policy stops it from making any network connection at all.

## Using it

1. In Calibrate, open the annotation task and download the **items export**. That is the CSV with one row per conversation.
2. Open the page and drop the CSV on it. You can drop the task's `evaluators.json` along with it, but you don't have to.
3. The page reads the raters, questions and AI evaluator version from the column names.
   - Rater names, question names, workshop prefixes and judge versions can change from one task to the next. Nothing needs configuring.
4. Use **Agreement overview** and **Conversations** to find and discuss the conflicts:
   - who disagrees with the majority, on which conversation and question;
   - each rater's reasoning;
   - Krippendorff's α;
   - how the AI compares with the human majority.
5. One person takes notes for the group. In each conversation, the **Consensus** card under the ratings records:
   - an agreed answer and a note for each question in conflict;
   - a status: Agreed, Needs follow-up or Change rubric;
   - discussion notes and next steps.

   Notes save automatically in that browser.
6. **Download CSV** saves the original export with consensus columns added (listed below). To carry on later, drop that downloaded CSV back onto the page: the notes come back with it.
7. **Protected copy** saves a single, read-only HTML file with the dashboard and the notes, encrypted with a password. Share it through a restricted folder, and send the password through a different channel.
   - People download the file and open it in Chrome, Edge, Firefox or Safari.
   - The file can also be put on Vercel with the `deploy_vercel.py` script from the calibrate-workshop skill.

**Try it without real data:** click **Try it with invented data** on the start screen.

**Offline use:** save the page (Ctrl/Cmd+S) and open the saved file. It works without a connection.

## Answer names

Calibrate stores a rater's answer as the option's **value** (`1`, `2`, `true`) and the AI evaluator's answer as the option's **name** ("Yes"). The CSV on its own can't say which value is "Yes". The page finds the names from the first of these that applies:

1. **An `evaluators.json` you drop in.** This is the calibrate-workshop skill's format. It matches with or without the workshop prefix.
2. **A naming you saved earlier in this browser,** in Setup.
3. **A built-in preset whose pattern fits.** The presets are:
   - Yes / No / Not enough Information / Not Applicable stored as 1–4;
   - Routine / Emergency;
   - Yes / No.
4. **Otherwise Setup opens** so you can name the values. Until a question's options are named, the page leaves the AI evaluator out of every comparison for that question rather than guessing.

## The CSV with consensus

Every original column and cell is kept exactly as it was. These columns are added at the end, where `<Q>` is the question's column key, e.g. `W4_-_Accurate`:

| Column | Holds |
|---|---|
| `consensus_<Q>/value` | the agreed answer in Calibrate's own encoding (`1`, `true`), so it reads like another rater's column |
| `consensus_<Q>/label` | the agreed answer's name, or `No consensus` |
| `consensus_<Q>/reasoning` | the note for that question |
| `agreement_<Q>/status` | `unanimous`, `disagree`, `split` or `thin`, among humans, for answers as rated |
| `agreement_<Q>/majority` | the human majority answer |
| `agreement_<Q>/dissenters` | the raters who were off the majority |
| `consensus/status` | Agreed, Needs follow-up or Change rubric |
| `consensus/comment` | discussion notes |
| `consensus/next_steps` | next steps |
| `consensus/updated_at` | when the notes were last changed (ISO time) |

When you re-upload this file, the page reads the `consensus_*` columns back in. It recomputes the `agreement_*` columns rather than reading them.

## How the page reads the export

| Columns | Read as |
|---|---|
| `name`, `description`, `conversation_history` | the conversation as it was uploaded to Calibrate |
| `<rater>_<Question_Name>/value`, `/reasoning` | each rater's answer and reasoning |
| `<rater>/comment` | each rater's note on the whole conversation |
| `evaluator_<Question_Name>_v<N>/value`, `/reasoning` | the AI judge; if it ran more than once, the newest version is used |

The page works out which part of each column name is the rater in one of three ways, tried in this order:

1. from the `/comment` columns;
2. from the question names in the AI or `evaluators.json` columns;
3. from the column pattern.

Messages written in the calibrate-workshop format (`*** SPEAKER ***`, original text and English translation) are shown with a toggle for the original. Messages in any other format are shown as plain text.

## Why it runs in the browser

The agreement maths already ran as JavaScript in the earlier workshop dashboards. Parsing the CSV in the browser as well means:

- no server holds the conversations;
- there is nothing to deploy for each workshop;
- staff don't need Python or R installed.

The only data that ever leaves the laptop is the encrypted copy someone chooses to share.

## Development

- `src/` holds the sources:
  - `csv.js`: reader and writer;
  - `parse.js`: column detection and the model;
  - `scales.js`: answer names;
  - `metrics.js`: agreement maths;
  - `consensus.js`: notes and the CSV;
  - `snapshot.js` and `unlock.html`: the protected copy;
  - `dashboard.js` and `app.js`: the user interface.
- `node build.mjs` inlines everything into `index.html`. Commit the result: GitHub Pages serves it from `main`.
- `npm test` runs the unit tests with Node 18 or later and no dependencies.
- `python test/e2e.py` runs the browser test in Chromium and WebKit. It needs Playwright.

All test data is invented. This repository is public: never commit an export, a downloaded CSV, a protected copy or real rater names. CI fails if a CSV is committed.
