## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, tailwindcss, sveltekit-adapter (static, GitHub Pages)

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

---

## This repository

Sketchpad's paper and live demo, nothing else. It started on 30 Oct 2026 as a clean repository; the exploration that
led here stays in `NeoVand/polyformer`, which is the lab record.

- **What belongs here:** the demo's runtime and page, the paper, and the scripts that reproduce a number the paper or
  the page states. Exploration, dead ends and agent logs stay in polyformer.
- **Porting is one way and recorded.** Every file brought over from polyformer gets a line in `PORTED.md` (path here,
  path there, polyformer commit). After a file is ported it changes only here; its polyformer copy is frozen.
- **Model files never go in git** (`*.onnx*`, `*.safetensors`, `*.pt`). They live on Hugging Face
  (`mohsenvand/sketchpad-0.8b-preview`, `mohsenvand/sketchpad-0.8b-runs`) and the page loads them pinned by revision.
- **Pushing `main` publishes the site** (GitHub Pages, `.github/workflows/deploy.yml`). Push only with Neo's OK.
- Model runs go on Modal, not the laptop GPU; the laptop GPU is the demo's.

## Working with Neo (teaching mode, from 30 Oct 2026)

Neo is the decision-maker and wants to understand every idea well enough to decide. Every agent on this project:

- **Defines terms on first use.** The first time a method, paper, theorem or piece of jargon appears in a message to
  Neo, give one sentence of what it is and one of why it matters here. Plain words; equations only when they are the
  shortest explanation.
- **Keeps the glossary current.** `/Users/neo/repos/polyformer/research/meta/GLOSSARY.md` (it moves here with the port) is the shared plain-words reference. When you define a new
  term for Neo, append it to the glossary in the same turn (what it is, who/when, why it matters to us). Never put a term
  in a message that is not also in the glossary.
- **Offers alternatives at the level of the constraint.** At a design decision, list the options that satisfy the goal
  through different mechanisms, including ones that break one of Neo's conditions (`/Users/neo/repos/polyformer/research/meta/NEO_CONDITIONS.md`),
  and say which condition each breaks and what it buys. Name the field the problem belongs to and its standard
  solutions before inventing a trick (e.g. forgetting under fine-tuning is continual learning).
- **Runs the assumptions check.** At every decision, state what we are assuming that Neo did not ask for.
- **Teaches when asked and when it helps.** Answer Neo's conceptual questions fully; use the project's own numbers as
  examples; be honest about what is settled, what is conjecture, and what we have not read.
- **Feeds the idea zoo.** Ideas, mechanisms and theorems we meet are candidate entries for `/Users/neo/repos/polyformer/research/meta/IDEA_ZOO.md`
  (schema there); tag them in the glossary with `[zoo]` so they can be lifted later.
