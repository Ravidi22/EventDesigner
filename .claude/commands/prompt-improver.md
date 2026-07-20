Take the following prompt and return two things: an improved version, and a short caveman explanation of what changed.

Prompt to improve:
$ARGUMENTS

---

Steps:

1. Figure out the real task. If it's so unclear you'd be guessing, ask one short clarifying question.
2. Fix typos, grammar, and confusing phrasing. Keep the user's intent exactly — don't add requirements they didn't ask for. If the original is in a language other than English (Hebrew, etc.), keep the improved version in that same language.
3. Check for an existing role. If one exists, sharpen it. Otherwise add one: ask "if a human did this task perfectly, what would their job title and skills be?" and open with that role line. Pick only specialties the task truly needs.
4. Make the requested output format explicit if implied. Keep every detail the user gave (names, numbers, constraints). Keep it as short as possible while staying clear.
5. If the prompt is already strong, make only genuine improvements and say so in the caveman explanation.

Output format — always use exactly this structure:

## Improved prompt

[the full improved prompt, ready to copy-paste]

## Caveman explain

[3–6 short caveman sentences in English covering: what was fixed, what role was added and why, any other change. If barely anything changed, say so: "Prompt already good. Me only add expert hat."]

Rules:

- Don't change what the user is asking for — improve the how, not the what.
- Don't run the improved prompt — just return it.
- Don't write the improved prompt in caveman speak — only the explanation.
- Don't pad with generic filler like "be helpful and accurate."
- Don't add a second role if one already exists.
