# BITB List API

An HTTP API for your BITB List data. It reads and writes the same Firebase
data as `index.html`, so a task added through the API shows up in the app
straight away. `index.html` is not changed, and the site stays on GitHub Pages.

GitHub Pages can't run code, so the API runs on **Vercel** (free) from the
same GitHub repo.

## 1. Add these files to the Bitb repo

```
package.json
lib/bitb.js
api/lists.js
api/tasks.js
api/tasks/[id].js
```

Keep the folders exactly as shown. In GitHub: **Add file > Create new file**,
and type the full path (e.g. `api/tasks/[id].js`) as the file name. GitHub
makes the folders for you.

## 2. Get a Firebase key for the API

1. Open console.firebase.google.com and go to the **bitb-list** project.
2. Click the gear > **Project settings** > **Service accounts**.
3. Click **Generate new private key**. A `.json` file downloads.

Keep this file private. Never put it in GitHub: it gives full access to your
data.

## 3. Put the API on Vercel

1. Sign in at vercel.com with your GitHub account.
2. **Add New > Project**, pick the **Bitb** repo, and click **Import**.
3. Before you click Deploy, open **Environment Variables** and add two:
   - `FIREBASE_SERVICE_ACCOUNT`: open the downloaded `.json` file in a text
     editor, copy everything in it, and paste it in as the value.
   - `BITB_API_KEY`: any long random password you make up. This is your API
     key. Anyone who has it can read and change every list.
4. Click **Deploy**.

Vercel gives you an address like `https://bitb-xxxx.vercel.app`. Your API is at
that address followed by `/api/...`. From now on, every change you push to
GitHub updates it automatically.

## Using it

Send the key on every request as `Authorization: Bearer YOUR_KEY`.
Replace `YOUR-APP.vercel.app` below with your Vercel address.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/lists?email=X` | Shared lists that X is on (gives you list IDs) |
| GET | `/api/tasks?list=ID` | Tasks in a shared list (add `&assignee=X` to filter) |
| GET | `/api/tasks?email=X` | X's Personal tasks |
| POST | `/api/tasks` | Add a task |
| PATCH | `/api/tasks/TASK_ID` | Tick/untick or rename a task |
| DELETE | `/api/tasks/TASK_ID?list=ID` or `?email=X` | Delete a task |

Personal tasks only work for people who have signed in to BITB List at least once.

### See your shared lists

```bash
curl "https://YOUR-APP.vercel.app/api/lists?email=you@gmail.com" -H "Authorization: Bearer YOUR_KEY"
```

### Add a task to a shared list

```bash
curl -X POST https://YOUR-APP.vercel.app/api/tasks -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '{"list":"LIST_ID","text":"Send the invoice","assignee":"akash@gmail.com","createdBy":"you@gmail.com"}'
```

`assignee` and `createdBy` must be on the list. If left out, `createdBy` is the
list owner and `assignee` is `createdBy`.

### Add a task to someone's Personal list

```bash
curl -X POST https://YOUR-APP.vercel.app/api/tasks -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '{"email":"you@gmail.com","text":"Call the bank"}'
```

### Tick a task

```bash
curl -X PATCH https://YOUR-APP.vercel.app/api/tasks/TASK_ID -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -d '{"list":"LIST_ID","done":true}'
```

Errors come back as `{"error": "..."}` with a 400, 401, 404, 405 or 500 status.
