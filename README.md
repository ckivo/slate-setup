# Set up Slate with your own Google Drive

Slate is a private daily desk for trading Nasdaq-100 futures (MNQ and NQ). It keeps your trades, journals, money and health in one place and syncs between your computer and your phone.

Slate has no shared server. Your account and your data live in **your own Google account**, through a small script you install yourself (a "Google Apps Script"). Nobody else's Drive is involved, including whoever runs the Slate site.

**Slate is at [slates-eight.vercel.app](https://slates-eight.vercel.app/).** Bookmark it: it's the one link for everyone, on every device.

This guide takes about 15 minutes. You need a computer for the setup; after that you can use Slate on your phone too.

**Contents**

- [What you need](#what-you-need)
- [Part 1: Install your backend in Google Apps Script](#part-1-install-your-backend-in-google-apps-script)
- [Part 2: Create your Slate account](#part-2-create-your-slate-account)
- [Part 3: Add Slate to your phone](#part-3-add-slate-to-your-phone)
- [Part 4: Optional extras](#part-4-optional-extras)
- [Part 5: Updating the script later](#part-5-updating-the-script-later)
- [Your data and privacy](#your-data-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Using Slate](#using-slate)

---

## What you need

- **A Google account.** Your data is stored in its Google Drive. If you want Bank of America alerts in Finance (optional), use the Gmail account that receives those alerts.
- **Slate itself: [slates-eight.vercel.app](https://slates-eight.vercel.app/).** That's the website you'll use every day.
- **This repo's script file:** [`pulse-backend.gs`](pulse-backend.gs). You'll copy all of it in Part 1. (It's called "pulse" because Slate used to be called Pulse. The name doesn't matter.)

Three things you'll create along the way:

| Thing | What it is | Keep it private? |
|---|---|---|
| **Web app URL** | Your script's address. Starts with `https://script.google.com/` and ends in `/exec`. Slate sends your data here. | Fine to keep on your devices; don't post it publicly. |
| **Dashboard key** | A long secret code the script makes the first time it runs. You need it once, to create your account. | **Yes.** Anyone with it and your URL can read your data through the script. |
| **Username and password** | All you need to sign in, on any device. | **Yes.** There is no password reset. Use a password manager. |

---

## Part 1: Install your backend in Google Apps Script

### Step 1. Copy the script

1. Open [`pulse-backend.gs`](pulse-backend.gs) in this repo.
2. Click the **Copy raw file** button (two overlapping squares, top right of the file view). That copies the whole file.
   - If you don't see it, click **Raw**, press **Ctrl+A** (Windows) or **Cmd+A** (Mac) to select everything, then **Ctrl+C** / **Cmd+C**.
3. Make sure you copied the **whole file**, from the first line (`/**`) to the last (`}`). A partial copy won't work.

### Step 2. Make a new Apps Script project

1. On your computer, go to [script.google.com](https://script.google.com) and sign in with the Google account that should hold your data.
2. Click **New project**.
3. The editor opens with a file called `Code.gs` containing a few lines (`function myFunction() { … }`). Select all of it and delete it, so the editor is empty.
4. Paste the script (**Ctrl+V** / **Cmd+V**).
5. Click **Untitled project** at the top and rename it, for example **Slate**.
6. Click the **Save** icon (the floppy disk) or press **Ctrl+S** / **Cmd+S**.

### Step 3. Run `setup` once and approve the permissions

1. In the toolbar above the code there is a dropdown with a function name in it. Choose **setup**.
2. Click **Run**.
3. Google shows **Authorization required**. Click **Review permissions** and choose your Google account.
4. Google warns **"Google hasn't verified this app"**. That's expected: it's your own private script, not a published app. Click **Advanced**, then **Go to Slate (unsafe)** (it shows whatever you named the project).
5. Google lists what the script can access. If there are checkboxes, tick **Select all**. Click **Allow** (or **Continue**).

What it asks for, and what the code actually does with it:

- **Google Drive.** The script creates and edits only its own files: `pulse-sync.json`, `pulse-accounts.json`, one `pulse-sync-<username>.json` per account, and a "Pulse photos" folder. It doesn't open any other file.
- **Gmail.** Only for the optional Bank of America alerts in Finance. The script searches for Bank of America emails and reads them; it never sends, changes or deletes email.

Google words these permissions broadly (for example "see, edit, create and delete all of your Google Drive files"), because that's how it describes the whole Drive and Gmail services. The script is short and readable if you want to check it yourself. `setup` asks for Gmail even if you never use bank alerts, because it tries a sample search; that's harmless.

### Step 4. Copy your dashboard key

1. When `setup` finishes, the **Execution log** opens at the bottom of the editor. (If it doesn't, click **Execution log** in the toolbar.)
2. Find the line **DASHBOARD KEY (paste into Finance → Live alerts):**. The long code on the next line is your dashboard key. (Ignore the "Finance → Live alerts" part; that's an old label. In Slate you paste the key when you create your account.)
3. Copy it into your password manager or a private note.
4. The log also says how many Bank of America alerts it found. "Found 0" is fine if you don't use them.

Lost the key? Run **setup** again. It prints the same key every time.

### Step 5. Deploy it as a web app

1. Click **Deploy** (top right), then **New deployment**.
2. Next to **Select type**, click the **gear icon** and choose **Web app**.
3. Fill in:
   - **Description:** anything, for example `Slate`.
   - **Execute as:** **Me** (your email address).
   - **Who has access:** **Anyone**.
4. Click **Deploy**. If Google asks you to authorize again, repeat Step 3.
5. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfycb…/exec`. This is your **Web app URL**. Save it next to your dashboard key.

Why "Anyone"? Slate runs in your browser and talks to your script directly, without a Google sign-in in between, so Google has to let the request through. "Anyone" only means the address answers. Nothing is readable without a signed-in Slate account (or your dashboard key), and new accounts can only be created with your dashboard key. "Anyone with a Google account" or "Only myself" will **not** work.

On a work or school Google account, **Anyone** may be missing because your admin blocks it. Use a personal Google account instead.

Don't use the **Test deployments** URL (the one ending in `/dev`). It only works while you're signed in to the editor.

---

## Part 2: Create your Slate account

1. Open **[slates-eight.vercel.app](https://slates-eight.vercel.app/)** on your computer.
2. Under the **Sign in** button, click **New here? Create an account**.
3. Fill in:
   - **Your Apps Script URL:** paste the Web app URL from Step 5 (ends in `/exec`). This is required, and Slate will only create your account on this URL.
   - **Username:** 3 to 32 characters: letters, numbers, dot, dash or underscore.
   - **Password**, then **Confirm password**: at least 8 characters. There's no reset, so save it in your password manager.
   - **Dashboard key:** paste it from Step 4.
4. Click **Create account**. You land on Home, empty and ready.

Slate then asks you to make a 4-digit PIN. It also unlocks Finance.

**Signing in on any other device.** Just your username and password, then your PIN. Your username and script link sit in a small lookup list in the script of whoever runs the site, which is how a new device finds your script. That list never holds your password or your data, and because of it usernames are first come, first served across everyone on the site. Anyone who guesses your username could see your script link, but they still need your password to get in.

**Forgot your PIN?** Tap **Forgot your PIN?** after signing in and paste your dashboard key. Your password alone can't reset it.

**Just want to look first?** **Look around first** on the sign-in screen opens Slate with made-up sample data on that device only. Nothing goes to any server. Use **Log out** in Settings to leave. Sample data never carries into a real account.

---

## Part 3: Add Slate to your phone

**iPhone (Safari)**

1. Open [slates-eight.vercel.app](https://slates-eight.vercel.app/) in **Safari**.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open Slate **from the new icon** and sign in there with your username and password, then your PIN.

The home-screen app keeps its own storage, separate from Safari, so sign in from the icon even if you already signed in in Safari.

**Android (Chrome)**

1. Open [slates-eight.vercel.app](https://slates-eight.vercel.app/) in Chrome.
2. Tap the **⋮** menu, then **Add to Home screen** (or **Install app**).
3. Open it from the icon and sign in the same way.

You only create the account once. Every other device just signs in.

---

## Part 4: Optional extras

Open **Settings** with the gear (top right).

### Trading settings (do these first)

- **Daily loss limit:** set it to your broker's daily loss limit. New accounts start at $500. Lowering it applies right away; raising it after today's first trade waits until tomorrow.
- **Main contract:** MNQ ($2 a point) or NQ ($20 a point).
- **Time zone:** decides what "today" is for your trades, journals and To Do.

**Slate can't stop trades at your broker.** It shows a "Done for today" screen when your logged P&L reaches your limit. For a real hard stop, set the limit at your broker too (on Tradesea: Settings → Personal Daily Loss Limit → "Liquidate and Block").

### API keys

Settings → **API keys**. Keys are encrypted on your device with a key made from your password, then saved to your account, so every device gets them.

**Anthropic (AI meal plans on the Health page)**

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up or sign in.
2. Add a little credit under **Billing**. Each plan costs a few cents, billed to you by Anthropic.
3. Open **API Keys**, create a key and copy it (starts with `sk-ant-`).
4. In Slate, paste it into **Anthropic (meal plans)**, click **Test Anthropic key**, then **Save keys**.

**USDA FoodData Central (food search when logging meals, free)**

1. Request a free key at [fdc.nal.usda.gov/api-key-signup](https://fdc.nal.usda.gov/api-key-signup). It arrives by email.
2. Paste it into **USDA FoodData Central (food search)** and click **Save keys**.

Without your own USDA key, Slate uses a shared demo key that runs out quickly.

### Bank of America alerts in Finance

This only works if your script runs in the Gmail account that receives your Bank of America alert emails (directly or forwarded).

1. In the Bank of America app: **Menu → Alerts**. Turn on email alerts for debit and credit card purchases (set the threshold to $0.01 so every purchase alerts), deposits and Zelle.
2. In Slate: **Finance**, open **Transactions**, then tap **Bank alerts**. Slate pulls the last 45 days and adds only new purchases.

If an alert isn't picked up: in your Apps Script choose **debugLatest** in the function dropdown, click **Run**, and read the log. It shows the three latest Bank of America emails and how they were read.

You can also bring in transactions with **Import CSV** (any bank CSV with Date and Amount columns).

### Finance PIN and Face ID

Settings → **Password and PIN** → **Set PIN**. A 4-digit PIN locks the Finance page on all your devices. After that, **Set up Face ID** lets that one device unlock with Face ID, Touch ID or Windows Hello, with the PIN as the fallback.

### Privacy mode

Settings → **Privacy mode**, or **Hide amounts** on Finance. Every dollar amount turns into `$****` and green and red turn grey. Good for screen sharing. It's per device.

---

## Part 5: Updating the script later

When a new version of [`pulse-backend.gs`](pulse-backend.gs) comes out:

1. Copy the whole new file (Step 1).
2. In your Apps Script project, select all the old code, delete it and paste the new code. Save.
3. If the update notes say so, run **setup** again (it keeps your key, files and accounts).
4. Click **Deploy → Manage deployments**, click the **pencil** (Edit) on your deployment, set **Version** to **New version**, and click **Deploy**.

Your Web app URL stays the same, so nothing changes in Slate.

Don't use **Deploy → New deployment** for updates: that makes a **new URL**, and sign-in would keep looking for the old one until whoever runs the site clears your name from the lookup list.

---

## Your data and privacy

What's true, plainly:

- **Where your data lives.** In your Google Drive: one `pulse-sync-<username>.json` file with your journals, trades, money, health and lists, and a `Pulse photos (<username>)` folder with your journal photos. A copy is also kept in each browser you use, so Slate works offline and syncs when it can.
- **Your data in Drive is not encrypted.** It's a normal file in your Google account, protected like the rest of your Drive. Anyone who can get into your Google account can read it.
- **Your password.** Slate never sends your password itself. On your device it turns your password into a "login proof" (PBKDF2, 310,000 rounds); only that proof goes to **your own** Apps Script, which stores a salted hash of it in `pulse-accounts.json`. A second key made from your password, which never leaves your device, encrypts your API keys.
- **Your API keys** are encrypted on your device before they're uploaded, so your script stores only scrambled text. When you use them, your browser talks to Anthropic or USDA directly.
- **The dashboard key is a master key.** With your Web app URL and dashboard key, someone could create accounts on your script and read your data through it. Keep it private. If it leaks, see [Troubleshooting](#troubleshooting).
- **Whoever runs the site** can't see your data: your browser sends it only to your Web app URL. You are trusting the code the Slate site serves, the same way you trust any website. If you want full control, you can host your own copy of the site.
- **No password reset.** Your password is the only key to your encrypted API keys. If you forget it, see [Troubleshooting](#troubleshooting).
- **Google's limits apply.** Apps Script has daily quotas. Normal personal use is far below them.

---

## Troubleshooting

**"Paste your own Apps Script web app URL…"**
The URL must start with `https://script.google.com/` and end in `/exec`. Copy it again from **Deploy → Manage deployments**.

**"Couldn't reach your Slate server"**
Check the URL and your internet connection. Make sure you copied the `/exec` URL, not the editor's address.

**"The server didn't answer like a Slate backend"**
The deployment's **Who has access** isn't **Anyone**, or you used the `/dev` test URL. Fix it under **Deploy → Manage deployments → pencil**, then **Deploy**.

**"Run setup() in the script first."**
You deployed without running `setup`. Do Step 3, then try again (no need to redeploy).

**"That dashboard key isn't right"**
Run **setup** again and copy the key from the log, with no spaces before or after.

**"That username is taken."**
Someone already made that username on your script (probably you). Pick another or sign in.

**"Wrong username or password" on a new device**
Check the spelling of both. There's no password reset. If your script's URL changed, whoever runs the site has to clear your name from the lookup list.

**"Too many attempts. Wait 10 minutes and try again."**
After 5 wrong passwords, sign-in pauses for 10 minutes.

**"Your session ended — please sign in again."**
Sessions last 30 days, and changing your password signs out your other devices. Just sign in.

**Changes don't show on my other device**
Check you're signed in with the same username on the same server on both. Open Settings → **Server and sync** and click **Sync now** on the device that has the change, then reopen Slate on the other one.

**"Anthropic said 401" or meal plans fail**
Check the key with **Test Anthropic key** and your credit balance at console.anthropic.com.

**Food search stops working**
The shared USDA demo key ran out. Add your own free USDA key (Part 4).

**My dashboard key leaked**
In your Apps Script choose **resetKey** and click **Run**. The log prints a new key. Existing accounts keep working; the old key stops working.

**I forgot my password**
There's no reset. You can create a new account on your script with your dashboard key, but the old account's data stays under the old username and its API keys can't be decrypted. Download a backup now and then (Settings → **Data** → **Download backup**).

**I want to start over**
Delete the `pulse-*.json` files and `Pulse photos` folders from your Drive, and in Apps Script open **Project Settings** (gear) and delete the **Script Properties**. Then run **setup** again (you'll get a new dashboard key).

---

## Using Slate

### Getting around

- **Phone:** a floating bar at the bottom: Home, Journals, Health and Finance, then the round **Recap** button. To Do opens from Home.
- **Computer:** the same bar stands up as a rail on the left edge, with labels and all five pages (To Do included), plus Recap.
- **Settings** is the gear at the top right. **Theme** there switches Dark, Light, Auto (follows your device) or Mono (black, white and greys; gains and losses keep their green and red). **Log out** is at the bottom of Settings.
- **Your routine:** the round button at the bottom right of every page opens one card where you edit your habits, repeating to-dos and the built-in trading steps (their times, or switch one off). Changes save as you type.
- **Your trading rules:** on Journals, open the Trading calendar and click the **Rules** tab on its right edge (or pick **Rules** from the Journals title menu). Write your own rules in groups you name. Slate's own rules sit on top: change their numbers, or delete any you don't want (the loss limit stays; **Restore** brings deleted ones back). The **Rules** button on Home shows them all at a glance, and **Settings → Rules on every page** shows them on every page: **Corner** (one at a time) or **Ticker** (sliding along the bottom).
- **Title menus:** on Journals, Health and Finance, the page title is a button with a small ▾. It lists the sections (for example Health: Today, Meals, Workouts, Meal plan, Macros), each with a live line from your data. On a computer a section slides out as a panel from the right; on a phone it opens as a sheet. Close it with ×, Escape or by clicking outside.
- **Command bar:** press **Ctrl+K** (**Cmd+K** on Mac) or **/** to jump to a page, log a trade, turn privacy on or off, and more.
- Groups of things sit in **split cards**: one glass card cut into pieces, one piece per item.

### A trading day

1. **Before the open: the game plan.** On Home on your computer, open **Game plan**: pick Long, Neutral or Short, note your key levels and news, write today's one rule, and **Lock in plan**. If you log a trade without a locked plan, Home says "Traded without a locked plan."
2. **After each trade: log it.** The editor is one compact screen: contract and side, contracts, entry and exit (P&L fills itself in: MNQ $2 a point per contract, NQ $20), setup and grade, then rows for account, tags and feelings, notes and photos. **Save trade**.
3. **Watch the meter.** On a computer, Home shows today's P&L against your daily loss limit and how much room is left, with its line underneath (hover it for each trade's time and P&L). Switch the range with **Day / Week / Month / Year**; the **Edge** row (expectancy, profit factor, average win and loss) follows the range.
4. **Protect the green.** Once today's P&L has peaked at **$600 or more**, a second line appears: "Protect the green". Its floor is half your peak, and the room left becomes the smaller of your loss-limit room and the room above that floor. If you give back half your peak, Home says so and offers "I'm done". This is a nudge only; it doesn't lock anything.
5. **The loss lock.** When today's logged P&L reaches your daily limit, a full-screen **"Done for today."** appears. Start your review, and a small reminder stays for the rest of the day. You can still journal. Slate only knows what you log, and it **can't** close positions or block orders at your broker.
6. **After the session: journal.** Log mistakes in **Mental** with the fix for next time, and write the **Daily review** (rating, what went well, what to improve, tomorrow's focus). Tick off To Do.

### Recap and Tomo

- The **Recap** button makes a plain-text file of your day or week (game plan, trades with notes and photo names, mental entries, review, To Do and habits), with the photos. **Share** sends it (on phones that support it); **Save** downloads it. Your name from Settings goes at the top.
- **Send to Tomo** is the round paper-plane button: next to the game plan, on each journal card and entry, and **Send today to Tomo** on Journals. The plane flies to the middle of the screen and the same card opens with just that piece, ready to send to your coach.

### The pages

- **Home on your phone:** four rings (To Do, Habits, Food, Journals) and your day as a timeline with a "now" line. Tap a ring to show only its items; earlier items fold into one row. It's for tracking the day, so there's no game plan to write there.
- **Home on a computer:** P&L and the loss meter, protect the green, the Edge row, and one split card with Game plan, Checklist, To Do, Journals and Health. Today's mistakes sit beside the P&L.
- **Journals:** the month's P&L, then one card each for Trading, Mental and Daily, with its recent entries, its own **Log** and a paper plane. Your costliest mistakes sit underneath. The title menu has Overview, Calendar, Gallery and Setups.
- **Backtesting:** on Journals, open the Calendar, pick **Trading**, then switch **Live / Backtest** to **Backtest**. **+ Log** starts a session: the day you backtested (today unless you change it), the market, then a calendar of past market days. Days you already backtested on that market in other sessions have a dot. Tap a day to add the trades you took (long or short, setup, win, loss or break-even in R, time, note), or mark it backtested with no trade. Backtest stats (win rate, expectancy in R, best setup) stay separate from your real trading.
- **To Do:** the day, the week, habits with streaks, and reminders. On market days the trading routine adds itself.
- **Health:** calories and macros, today's meals on a timeline, "What fits in what's left", workouts, AI meal plans (Anthropic key) and the shopping list. Missed tracking a workout? **Log past workout** (under Workouts → Workout history, or Live workout) takes the date, the program day, your sets and how long it took, and ticks your Gym habit for that day. Tracked workouts with a coach or an AI chat? **Import from Assistant** (next to it) reads the text you paste, using your Anthropic key, and shows every workout it found for you to tick before they're added.
- **Finance:** net worth, where your money lives, spending this calendar month, bills for the next 7 days, transactions (manual, CSV or Bank alerts), investments and trading accounts. You type trading accounts in yourself; Slate doesn't connect to your broker.

Deleting something shows **Undo** for a few seconds.
