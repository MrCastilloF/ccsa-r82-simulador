# CCSA R82 Simulator · Check Point Practice Exam

Web practice app for the **Check Point Certified Security Administrator (CCSA) R82** exam.
It opens from a link, needs no installation and stores your progress in the browser.

> **Private access.** The site asks for a username and password. Credentials are handed out by
> whoever runs the simulator; they are not written anywhere in this repository.

**Live site:** <https://mrcastillof.github.io/ccsa-r82-simulador/>

---

## 1. What is inside

| Feature | Detail |
| --- | --- |
| Question bank | **182 questions** across the **10 modules** of the course |
| Question types | Single choice (99) and multiple choice (33), with a clear hint when several options must be picked |
| Session size | You choose how many questions to answer, up to the whole bank |
| No repeats | Inside a session each question appears once, in random order |
| Two modes | *Guided practice* (correction and explanation right away) and *Exam simulation* (results only at the end) |
| Feedback | A written explanation for every answer, plus the exact course page it comes from |
| Score | Correct answers, percentage and the 70 % reference threshold |
| Review | Every question with your answer, the correct one and the explanation |
| Progress | Session history, average, score trend and bank coverage |
| Storage | `localStorage` + cookies (history is kept between sessions and devices) |
| Images | Figures taken from the course material, labelled by page and expandable |
| Interface | Dark course-platform look, smooth animations, progress bar and session map, mobile ready |

---

## 2. How to use it

1. Open the published link.
2. Type the **username** and **password** you were given.
3. Choose how many questions to answer and the practice mode.
4. Answer away: in *Guided practice* you immediately see whether you were right and why.
5. At the end you get your score, the per-module breakdown and the full review.
6. **New session** starts fresh with different questions.

Shortcuts: keys `1`–`5` pick an option, `Enter` checks the answer or moves on.

### About access

The password is **never stored** on a server or in the repository. It derives a key
(AES-256-GCM + PBKDF2-SHA256, 310 000 iterations) that decrypts the question bank in your browser.
With a wrong password the content simply cannot be decrypted.

Sign-in **ignores capital letters** and **spaces** at the beginning or end, to avoid problems when
typing or pasting on a phone.

### About progress

- Every new session starts from zero: nothing is carried over from previous answers.
- History and seen questions are saved (localStorage + cookies) so you can pick up where you left off.
- You can erase everything from **My progress → Erase my progress**.

---

## 3. Run it locally

The site must be served over HTTP (browsers block `fetch` and cookies on `file://`):

```bash
cd checkpoint-ccsa
python -m http.server 8080
# open http://localhost:8080
```

`npx serve .` or the VS Code *Live Server* extension also work.

---

## 4. Publish on GitHub Pages (free)

This project is already published at **<https://mrcastillof.github.io/ccsa-r82-simulador/>**.
GitHub Pages serves it from the **`gh-pages`** branch.

To recreate it from scratch:

1. Create a repository (it can be public) and push the contents of this folder:

   ```bash
   git init
   git add .
   git commit -m "CCSA R82 simulator"
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   git push origin main:gh-pages    # this branch turns Pages on
   ```

2. On GitHub: **Settings → Pages** → *Deploy from a branch*, branch **`gh-pages`**, folder `/ (root)` → **Save**.
   (If the `gh-pages` branch already exists, GitHub usually enables it automatically.)
3. In 1–2 minutes the site is live at `https://YOUR_USER.github.io/YOUR_REPO/`.

### Update the site

```bash
git add -A && git commit -m "Changes" && git push origin main
git push origin main:gh-pages        # publishes the latest version
```

> The repository only contains the **encrypted** content (`assets/data/content.enc.json`) and the
> username fingerprint (`assets/data/auth.json`). The plain-text bank is not published.

---

## 5. Change the username and password

You need the plain-text question bank (`contenido/preguntas.json`) and the scripts in `tools/`.
From the folder that contains `contenido/` and `checkpoint-ccsa/`:

```bash
# 1) Join the modules into one file (if you edited any module)
node tools/merge-content.mjs

# 2) Re-encrypt with the new credentials
node tools/build-content.mjs --user "newUser" --pass "NewStrongPass" \
  --in contenido/preguntas.json --out checkpoint-ccsa

# 3) Check that it decrypts
node tools/verify-decrypt.mjs checkpoint-ccsa "newUser" "NewStrongPass"
```

Then commit and push `assets/data/*.json`. The password is never written to disk: only its derived
fingerprint (salt + username hash) and the encrypted content are stored.

Recommendations: long password (16+ characters), rotate it if it leaks, never reuse it.

---

## 6. Project layout

```
checkpoint-ccsa/
├── index.html                  Full UI (login + home + exam + results + progress)
├── assets/
│   ├── css/styles.css          Layout, animations and mobile adaptation
│   ├── js/auth.js              Login, key derivation and content decryption
│   ├── js/app.js               Session engine, grading, scoring and persistence
│   ├── data/content.enc.json   Encrypted question bank (AES-256-GCM)
│   ├── data/auth.json          Salt, iterations and username fingerprint
│   └── img/                    Figures cropped from the material + favicon
├── tools/
│   ├── merge-content.mjs       Joins the modules into preguntas.json
│   ├── build-content.mjs       Encrypts the bank and writes auth.json
│   ├── verify-decrypt.mjs      Checks credentials and decryption
│   └── make-preview.mjs        Local copy without login (design checks only)
├── .nojekyll
└── README.md
```

The plain-text bank (`contenido/`) is delivered separately, outside the public repository, together
with the material screenshots. That is why the scripts run from the parent folder that holds
`contenido/` and the app folder.

---

## 7. Where the content comes from

All content comes from the **Check Point Certified Security Administrator (CCSA) R82** course
material (*Security Administrator* student guide, 521 pages).

- Work was done from **474 page screenshots** of the material (Tesseract OCR plus visual review).
- Every question stores its **module** and its **page**, and the interface shows them
  (for example: *Module 4 · page 197*).
- Explanations paraphrase what the material says; no external concepts were added.
- Attached figures were cropped from the matching pages and are labelled with their page.
- Options are reordered deterministically when the content is generated (one seed per question),
  so the correct answer is spread across all positions instead of always being the same letter.
  The order is stable between builds.
- Options were written with comparable lengths, so length alone rarely reveals the answer.
- A question history keeps, for every question, its id, the concept it evaluates, its module and its
  page (`contenido/historial.json`). It lives outside the public repository because it contains the
  bank in plain text, and it is consulted before adding new questions so the same concept is never
  evaluated twice.
- The current bank is **182 questions**: the original 132 plus **50 added on 2026-11-25**, all taken
  from pages the first version did not use (preface resources, CLI verification commands, rule and
  zone details, layer management, log queries and actions, identity sources, HTTPS Inspection
  settings, URL Filtering practices and Threat Prevention profiles).

### Coverage by module

| Module | Name | Questions | Pages |
| --- | --- | --- | --- |
| 1 | Introduction to Quantum Security | 32 | 19–49 |
| 2 | Administrator Account Management | 19 | 105–121 |
| 3 | Object Management | 16 | 157–166 |
| 4 | Security Policy Management | 29 | 191–220 |
| 5 | Policy Layers | 12 | 247–256 |
| 6 | Security Operations Monitoring | 22 | 287–313 |
| 7 | Identity Awareness | 16 | 361–372 |
| 8 | HTTPS Inspection | 17 | 423–435 |
| 9 | Application Control and URL Filtering | 9 | 465–471 |
| 10 | Threat Prevention Fundamentals | 10 | 497–504 |

The pages in between are guided labs (click-by-click steps in the environment), which is why they do
not produce exam questions.

---

## 8. Limitations and known ambiguities (please read)

1. **No `examen_checkpoint.pdf` was provided.** The folder contained page screenshots of the CCSA R82
   course material, not a question bank with an answer key. The questions were therefore written from
   the conceptual statements in the material, **not** copied from an official answer key.
2. **This is not the official exam.** It is study material. The real exam wording and its passing
   score may differ; 70 % is used here only as a reference threshold.
3. **Lab pages.** The modules include dozens of lab pages with environment credentials and IP
   addresses (for example `Chkp!234`). Those are not used as questions, to avoid testing ephemeral
   lab details.
4. **Transcription.** Text was extracted with OCR from screenshots. Everything used in questions was
   reviewed visually, but figures may show minor formatting differences.
5. **Multiple-choice questions.** In the material most concepts appear as lists. When the natural
   answer is a set of items, the question is marked as multiple choice and the interface states how
   many options must be picked. Grading requires the exact set.
6. **Topics beyond the course.** Custom Threat Prevention, Smart-1 Cloud, APIs and advanced features
   are mentioned but deferred to other courses; only what CCSA R82 covers is asked.
7. **Language.** The interface and the question bank are in English. The original working notes and
   the Spanish draft of the bank are kept outside the public repository.

---

## 9. Security: what it protects and what it does not

- **It protects:** the question bank is encrypted; without valid credentials it cannot be read, not
  even by looking at the source code or the repository.
- **It does not protect:** being a static site, the login page and the code are public, and a weak
  password could be attacked offline against the encrypted file. Use a long, unique password.
- If you need real server-side authentication (for example email or Google accounts), publish the same
  folder on **Cloudflare Pages** behind **Cloudflare Access** (free tier for small teams). The app works
  unchanged; only the hosting changes.

---

## 10. Legal notice

Independent study material built from the CCSA R82 course content.
Check Point, Quantum and SmartConsole are trademarks of Check Point Software Technologies Ltd.
This project is not affiliated with or endorsed by Check Point.
