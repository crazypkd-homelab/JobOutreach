# Prompts

These files are the system prompts sent to Ollama. On first boot they are copied to `data/prompts/`; edit the copies there (changes are picked up automatically, no restart needed). Use "Reset to default" in Settings to restore the bundled version.

| File | Used for |
|---|---|
| `extract_jd.md` | Turning raw job-posting text into a structured `JobDescription` |
| `score_resume.md` | Comparing a `JobDescription` against a resume to produce a `MatchScore` |

## Safe to edit

You can change wording, add rules, add few-shot examples, or tune what counts as a "match". The **output shape is not controlled by the prompt** — the app passes a JSON Schema to Ollama and validates the response. So edits here cannot break the app; at worst a badly worded prompt produces lower-quality fields.

The `overall` match score is computed by the app from the weighted dimension scores, not by the model.
