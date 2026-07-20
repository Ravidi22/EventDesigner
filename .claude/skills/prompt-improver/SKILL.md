---
name: prompt-improver
description: Use when the user asks to improve, fix, upgrade, rewrite, polish, or "make better" a prompt; shares a prompt and asks what's wrong with it; says "improve this prompt" or "make this stronger"; or pastes text they plan to send to an AI (Claude, ChatGPT, etc.) and wants it improved — even if they never use the word "prompt."
---

# Prompt Improver

Take the user's raw prompt and return the improved version.

## Why this matters

People write prompts quickly — typos, missing context, no role for the AI to play. A model told "You are an expert tax accountant with 15 years of experience" answers a tax question better than one given no role. Fixing the wording and giving the AI the right profession makes the same request produce much better results.

## Steps

1. **Understand the real task.** What is the user actually trying to get done? Distinguish two kinds of gaps:
   - **Form** (role, format, length, structure): fill these yourself with the best default — that's the job.
   - **Content only the user has** (files they'll send later, changes they have in mind, decisions that are theirs): never invent it and never reassign it to the AI. If it blocks improving the prompt, ask one short clarifying question; otherwise reserve the user's turn inside the prompt (step 2).
2. **Map who does what.** When the prompt describes phases or a back-and-forth ("after you…", "then we'll…", "I want to think with you"), the improved prompt must name the owner of every step. First-person lines like "I need to change a couple of things" or "I'll send X" mean the user is holding content: write an explicit gate — "Then stop and wait for me to provide…" — never convert it into work the AI does instead ("point out what you think should change").
3. **Fix the language.** Correct typos, grammar, and confusing phrasing. Keep every detail the user gave (names, numbers, files, constraints) — they are the most valuable part of the prompt. Keep the original language (Hebrew stays Hebrew) unless the user asks otherwise.
4. **Give the AI the right profession.** If the prompt already assigns a role, sharpen it — never stack a second one. Otherwise ask yourself: "if a human did this task perfectly, what would their job title and skills be?" and open the prompt with that role line:
   - Rental contract → "You are an experienced real-estate lawyer who writes clear, enforceable contracts."
   - Slow SQL query → "You are a senior database engineer who specializes in query optimization."
   Pick only the specialties the task truly needs — a long list of titles dilutes the effect.
5. **Tighten structure where it helps.** Make the expected output explicit (list, table, length, language) when implied. Keep it as short as possible while staying clear — longer is not better. If the prompt is already strong, change only what genuinely helps; don't invent busywork.

## Output format

ALWAYS use this structure:

```
## Improved prompt

[the full improved prompt, ready to copy-paste]
```

Add directly below the prompt, ONLY if a wrong guess would change what the AI does or who does which step (not for routine wording or tone choices):

```
**Assumptions:** [each guess in one short line — so the user can veto before pasting]
```

Omit the Assumptions section otherwise — most simple prompts need none.

## Examples

**Simple task.** Input: `writ me tweet about my new app it track water drinking remind u to drink`

```
## Improved prompt

You are a social media copywriter who specializes in catchy, high-engagement product launch tweets. Write a tweet announcing my new app. The app tracks how much water you drink and sends reminders to drink. Keep it under 280 characters, friendly in tone, and end with a call to action.
```

**Collaborative task** (phases; the user is holding content). Input: `analyze the @docs/requirements.md, i need to sharp couple things, after you i want to clearfy and think with you then write the final doc`

```
## Improved prompt

You are a senior product analyst who turns rough requirements into clear documents. Work with me in phases, and don't skip ahead:

1. Analyze docs/requirements.md: summarize what it defines and flag gaps, contradictions, and open questions.
2. Then stop — I will tell you the changes I have in mind. Help me define them; we'll clarify and decide together.
3. Only after we've agreed, rewrite the document.

**Assumptions:** "sharp couple things" = changes you already have in mind and will provide after the analysis — not changes the AI proposes on its own.
```

## What not to do

- Improve the _how_, never the _what_ — don't add requirements the user didn't ask for, don't remove ones they did.
- Don't absorb the user's part into the AI's: "I need to fix a couple of things" reserves the user's turn — it does not mean "suggest fixes."
- Don't run the improved prompt unless the user asks. The job is to hand back the prompt.
- Don't pad with generic filler like "be helpful and accurate" — every added line must earn its place.
