# calibrate-dashboard

A web page for expert review meetings. You open the ratings file from a Calibrate labeling task and see where the experts agreed and disagreed. One person then writes down what the group decides about each conflict.

Everything happens in the browser. The CSV is never uploaded, and the page's content security policy blocks every network connection, so it couldn't send the file anywhere even by mistake.

## Where to open it

The page lives at https://littlehifive.github.io/calibrate-dashboard/. Bookmark it and open it whenever you have a review to run. It is an ordinary web page, so there is nothing to install and no account. Your file is still read on your own computer and never sent anywhere.

If you'd rather have a copy on your computer, or need to work offline, save the page (Ctrl+S, or Cmd+S on a Mac) and double-click the saved file. It works the same way.

The page doesn't keep a list of projects: each project is just its own CSV. Open the file for the project you're working on, and use ⋯ > Open a different file to switch. A folder per project works well, with the file from Calibrate and every download from this page side by side.

## Using it

1. Get the ratings file from Calibrate. In the left menu click Human alignment, open your labeling task, go to the Dataset tab and click Export CSV. The file name ends in `-items.csv`.
2. Open the page and drag the file onto it. The page works out the experts, the questions and the AI evaluator version from the column names. Names, prefixes and judge versions can change from one task to the next without any setup.
3. Step 1, Overview: the headline numbers, then agreement for each question, who is off the majority, pairwise agreement between people and how each person used the options. Every number has an (i) button with its formula, and hovering over a cell says exactly what it counts.
4. Step 2, Review conversations: the transcript, the ratings and the Consensus column sit side by side. The conversation list slides in and out with the List button. In the Consensus column:
   - A, Agreed answers: the answer the group settled on for each question in conflict, with an optional reason.
   - B, Follow-up: an outcome (Not discussed yet, Resolved, Needs follow-up, Change the rubric), what you discussed, and next steps.

   Drafts save in the browser as you type. Press Submit at the bottom of the column when the group has decided; once you've made changes, the Next button turns into "Submit and next". The list marks each conversation ● (changes not submitted) or ✓ (submitted), and the counter in the top right shows how many are in each state.
5. Step 3, Consensus & download: every submitted decision in one table, and the download. Download results gives you the CSV you opened with the submitted decisions added as columns (listed below). Unsubmitted drafts are left out, and the page tells you if there are any. To carry on another day, open that downloaded CSV on the page and the decisions come back.
6. To share with experts who don't have the CSV, use ⋯ > Share a password-protected copy. It saves one read-only HTML file, locked with a password, with the submitted decisions. Put it in a folder only the experts can open and send the password separately. They download the file and open it in Chrome, Edge, Firefox or Safari. If you want a link instead, the calibrate-workshop skill's `deploy_vercel.py` can put the same file on Vercel.

To look around first, click "Try it with made-up data" on the start page.

## Answer names

Calibrate saves an expert's answer as the option's value (`1`, `2`, `true`) but the AI evaluator's answer as the option's name ("Yes"). The CSV alone doesn't say which value means "Yes", so the page takes the names from the first of these that it finds:

1. A question definitions file (`evaluators.json`, the calibrate-workshop skill's format), loaded under ⋯ > Rename experts and answers > Advanced. It matches with or without the workshop prefix.
2. Names you saved earlier in this browser.
3. A built-in preset that fits the answers: Yes / No / Not enough Information / Not Applicable stored as 1 to 4, Routine / Emergency, or Yes / No.
4. If none fits, the naming screen opens. Until a question's options have names, the page leaves the AI out of every comparison for that question instead of guessing.

## The downloaded CSV

Every original column and cell stays exactly as it was. These columns are added at the end, where `<Q>` is the question's column key, such as `W4_-_Accurate`:

| Column | Holds |
|---|---|
| `consensus_<Q>/value` | the agreed answer in Calibrate's own encoding (`1`, `true`), so it reads like another rater's column |
| `consensus_<Q>/label` | the agreed answer's name, or `No consensus` |
| `consensus_<Q>/reasoning` | the reason given for that question |
| `agreement_<Q>/status` | `unanimous`, `disagree`, `split` or `thin`, among the experts, for answers as chosen |
| `agreement_<Q>/majority` | the experts' majority answer |
| `agreement_<Q>/dissenters` | the experts who were off the majority |
| `consensus/status` | the outcome: Resolved, Needs follow-up or Change the rubric |
| `consensus/comment` | what you discussed |
| `consensus/next_steps` | next steps |
| `consensus/updated_at` | when the decision was submitted (ISO time) |

When you open this file again, the page reads the `consensus_*` columns back in as submitted decisions. It recalculates the `agreement_*` columns rather than trusting them. Files saved by the first version of the page, which used the outcome names "Agreed" and "Change rubric", still read back correctly.

## How the page reads the export

| Columns | Read as |
|---|---|
| `name`, `description`, `conversation_history` | the conversation as it was uploaded to Calibrate |
| `<rater>_<Question_Name>/value`, `/reasoning` | each expert's answer and reason |
| `<rater>/comment` | each expert's note on the whole conversation |
| `evaluator_<Question_Name>_v<N>/value`, `/reasoning` | the AI judge; if it ran more than once, the newest version is used |

To find which part of a column name is the expert, the page tries the `/comment` columns first, then the question names from the AI columns or `evaluators.json`, then the overall column pattern.

Messages in the calibrate-workshop format (`*** SPEAKER ***`, then the original text and an English translation) get a switch to show the original. Anything else is shown as plain text.

## Why it runs in the browser

The agreement maths already ran as JavaScript in the earlier workshop dashboards. Reading the CSV in the browser as well means no server ever holds the conversations, nothing needs deploying for each workshop, and nobody needs Python or R installed. The only thing that leaves the laptop is a locked copy that someone chooses to share.

## Development

`src/` holds the sources:

- `csv.js` reads and writes CSV;
- `parse.js` finds the columns and builds the model;
- `scales.js` works out answer names;
- `metrics.js` does the agreement maths, and `defs.js` holds the definition and formula behind every (i) button;
- `consensus.js` handles the notes and the downloaded CSV;
- `snapshot.js` and `unlock.html` make the password-protected copy;
- `dashboard.js` and `app.js` are the user interface.

`node build.mjs` inlines everything into `index.html`. Commit the result, because GitHub Pages serves it from `main`. `npm test` runs the unit tests (Node 18 or later, no dependencies). `python test/e2e.py` runs the browser test in Chromium and WebKit and needs Playwright.

All test data is made up. This repository is public, so never commit an export, a downloaded CSV, a protected copy or real names. CI fails if a CSV is committed.
