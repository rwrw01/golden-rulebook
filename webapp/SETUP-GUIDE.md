# Setup Guide — Angel Investor Pitch Evaluator

This guide walks you through the complete setup, step by step. No programming experience needed.

---

## What you need

- A computer (Windows, Mac, or Linux)
- An internet connection
- 15 minutes of time

---

## Step 1: Install Node.js

Node.js is the engine that runs the application. You only need to install it once.

1. Go to **https://nodejs.org**
2. Click the button that says **"LTS"** (the recommended version)
3. Open the downloaded file and follow the installer
   - On Windows: click Next through all steps, keep the default settings
   - On Mac: drag to Applications when prompted
4. **Verify it worked**: open a terminal and type:
   ```
   node --version
   ```
   You should see a version number like `v22.x.x`. If you see an error, restart your computer and try again.

### How to open a terminal

- **Windows**: press `Win + R`, type `cmd`, press Enter
- **Mac**: press `Cmd + Space`, type `Terminal`, press Enter
- **Linux**: press `Ctrl + Alt + T`

---

## Step 2: Install Claude Code

Claude Code is the AI that powers the evaluation. You install it through the terminal.

1. Open your terminal (see above)
2. Type this command and press Enter:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
3. Wait until the installation finishes (this may take a minute)
4. **Verify it worked**:
   ```
   claude --version
   ```
   You should see a version number.

---

## Step 3: Log in to Claude

You need an Anthropic account to use Claude Code. If you don't have one yet, you'll create it during this step.

1. In your terminal, type:
   ```
   claude auth login
   ```
2. A browser window will open automatically
3. If you already have an account: log in with your email
4. If you don't have an account: click "Sign up" and create one
5. After logging in, the browser will confirm the connection. You can close the browser tab.
6. **Verify it worked**:
   ```
   claude auth status
   ```
   You should see a message confirming you are logged in.

### About costs

Claude Code uses the Anthropic API, which requires a payment method. Visit **https://console.anthropic.com** to add billing details. A typical pitch evaluation session costs between $0.10 and $0.50, depending on how long the conversation runs.

---

## Step 4: Download and start the application

1. In your terminal, navigate to the application folder:
   ```
   cd path/to/golden-rulebook/webapp
   ```
   Replace `path/to/` with the actual location where you saved the project.

2. Install the application dependencies (one time only):
   ```
   npm install
   ```

3. Start the application:
   ```
   npm run dev
   ```

4. You should see:
   ```
   Angel Investor Pitch Evaluator
   http://localhost:8080
   ```

5. Open your browser and go to **http://localhost:8080**

---

## Step 5: Use the application

### The status indicator

In the top-right corner of the screen, you'll see a small dot:
- **Green dot** = everything is working
- **Red dot** = something needs attention (the screen will tell you what)

### Starting an evaluation

1. **Choose your mode**:
   - **Sparring** — tough, direct questioning with no guidance. Best if you've already pitched many times and want an honest mirror.
   - **Coaching** — challenging but helpful. When you get stuck, the evaluator offers thinking angles (but never gives you the answer). Best for most users.
   - **Masterclass** — the full experience. Challenges you, coaches you, and teaches you after each topic. Best if you're new to pitching.

2. **Enter your pitch**: type or paste your pitch in the text box. This can be anything — a formal pitch text, a rough idea, or just a few sentences describing what you want to build.

3. **Click "Start Evaluation"**

### During the evaluation

- The evaluator will ask you questions one by one
- Type your answer in the bottom input field and press Enter (or click Send)
- Be honest — the value of this tool is in getting real feedback, not in performing well
- If you don't know an answer, say so — the evaluator will help you think through it
- The session continues until all topics are explored or you decide to stop

### Downloading the report

When the session ends, a green **"Download Investment Memo (PDF)"** button appears. Click it to save the complete evaluation report to your computer.

---

## Troubleshooting

### "Claude Code not found"

The application cannot find Claude Code on your computer. Run step 2 again. If the problem persists, close your terminal, open a new one, and try `claude --version`.

### "Not authenticated"

Claude Code is installed but not logged in. Run step 3 again.

### The page won't load

Make sure the application is still running in your terminal (you should see the "http://localhost:8080" message). If you closed the terminal, run `npm run dev` again.

### "Max sessions reached"

The application supports a limited number of simultaneous sessions. Wait for the current session to finish, or restart the application.

### The evaluator stops responding

The AI conversation may take a few seconds between responses. If nothing happens for more than 30 seconds, refresh the browser page and start a new session.

---

## Stopping the application

In the terminal where the application is running, press `Ctrl + C`. This safely shuts down the application.
