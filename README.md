<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/graph.svg?title=Retcon&subtitle=Agent%20memory%20that%20can%20take%20things%20back&width=920&height=200&mode=dark&bg=0b1311&accent=3fd3b0&titleColor=e6eeea&subtitleColor=97a8a1&align=center&font=space-grotesk">
  <img alt="Retcon: agent memory that can take things back" src="https://shieldcn.dev/header/graph.svg?title=Retcon&subtitle=Agent%20memory%20that%20can%20take%20things%20back&width=920&height=200&mode=light&bg=f3f5f2&accent=0a7058&titleColor=12201b&subtitleColor=55655f&align=center&font=space-grotesk" width="100%">
</picture>

[![Stars](https://shieldcn.dev/github/Rudransh-1508/retcon/stars.svg)](https://github.com/Rudransh-1508/retcon/stargazers) [![Last commit](https://shieldcn.dev/github/Rudransh-1508/retcon/last-commit.svg)](https://github.com/Rudransh-1508/retcon/commits/main) [![Issues](https://shieldcn.dev/github/Rudransh-1508/retcon/issues.svg)](https://github.com/Rudransh-1508/retcon/issues) ![Hackathon](https://shieldcn.dev/badge/Built%20for-FalkorDB%20Graph%20Hacks.svg)

![Withdrawn advisories](https://shieldcn.dev/badge/advisories%20withdrawn-635-bb1d5c.svg) ![Withdrawn for other reasons](https://shieldcn.dev/badge/not%20duplicates-131-bb1d5c.svg) ![Events replayed](https://shieldcn.dev/badge/real%20events%20replayed-568-0a7058.svg) ![Worker](https://shieldcn.dev/badge/worker-every%2010%20min.svg?logo=githubactions)

[![Live app](https://shieldcn.dev/badge/Live%20app-open-0a7058.svg?variant=branded)](https://retcon-kappa.vercel.app) [![Real PRs](https://shieldcn.dev/badge/Real%20PRs-on%20GitHub.svg?logo=github&variant=secondary)](https://github.com/Rudransh-1508/retcon-target-wiredoor/pulls?q=is%3Apr) [![How it works](https://shieldcn.dev/badge/How%20it-works.svg?variant=secondary)](#how-it-works) [![Real runs](https://shieldcn.dev/badge/Real-runs.svg?variant=secondary)](#real-runs) [![Try it](https://shieldcn.dev/badge/Try-it.svg?variant=secondary)](#try-it) [![MCP](https://shieldcn.dev/badge/Use%20over-MCP.svg?logo=modelcontextprotocol&variant=secondary)](#use-retcon-from-your-own-agent-mcp) [![Data model](https://shieldcn.dev/badge/Data%20model-Cypher.svg?variant=secondary)](#graph-data-model-and-the-queries-retcon-depends-on) [![Architecture](https://shieldcn.dev/badge/System-architecture.svg?variant=secondary)](#architecture) [![Run locally](https://shieldcn.dev/badge/Run-locally.svg?logo=docker&variant=secondary)](#getting-started)

</div>

Retcon is a team of LLM agents whose shared memory is a [FalkorDB](https://www.falkordb.com/) graph in which every belief and every decision records what supports it. It watches real security advisories for real open-source projects and turns them into real GitHub pull requests. When an advisory is withdrawn, or a person corrects a belief, Retcon revises exactly the work that rested on it, and nothing more.

<p align="center">
  <a href="https://retcon-kappa.vercel.app/app"><img src="docs/images/console-why.png" alt="The Retcon console: a decision to upgrade jsonwebtoken, its 3D chain of support, the Planner's retracted plan and the decision's history" width="100%"></a>
</p>
<p align="center"><sub>The live console: a decision still held by 3 of its 4 advisories after the fourth was withdrawn.</sub></p>

![Python](https://shieldcn.dev/badge/Python-3.12.svg?logo=python) ![FastAPI](https://shieldcn.dev/badge/FastAPI-API.svg?logo=fastapi) ![Next.js](https://shieldcn.dev/badge/Next.js-16.svg?logo=nextdotjs) ![Tailwind](https://shieldcn.dev/badge/Tailwind-4.svg?logo=tailwindcss) ![three.js](https://shieldcn.dev/badge/three.js-3D%20graph.svg?logo=threedotjs) ![Vercel](https://shieldcn.dev/badge/Vercel-hosting.svg?logo=vercel) ![MCP](https://shieldcn.dev/badge/MCP-server.svg?logo=modelcontextprotocol) ![FalkorDB](https://shieldcn.dev/badge/FalkorDB-graph%20memory.svg) ![Groq](https://shieldcn.dev/badge/Groq-gpt--oss--120b.svg)

> [!IMPORTANT]
> What holds and what is retracted is decided by the graph, never by an LLM. Agents write beliefs, and the engine rejects any belief that does not name its support.

## The problem

Advisories are not final. In GitHub's npm and PyPI advisory data, 635 have been withdrawn, 131 of them for reasons other than being a duplicate:

- **jsonwebtoken (CVE-2022-23529):** claimed remote code execution in one of npm's most used packages. Live for 36 days, then withdrawn.
- **axios (GHSA-rm8p-cx58-hcvx):** withdrawn after a day because the flaw sits in `form-data`, and patching `form-data` is enough.
- **express (GHSA-pj86-cfqh-vqx6):** withdrawn because it "describes a correctness bug, not a vulnerability".

Teams act on advisories fast: hotfixes, upgrade PRs, blocked releases. When a claim is withdrawn, nobody can say which of that work rested on it. Stale work stays open, or a naive tool undoes too much and closes work that other, still valid advisories justify. Agent memory has the same flaw: it stores conclusions without their reasons, so it cannot be revised correctly.

## Features

- **Every belief keeps its reasons.** Nothing is written to memory without the evidence it rests on.
- **Exact retraction.** A withdrawal revises only the work that depended on it, and every affected decision gets an outcome: Cancel, Downgrade or Unchanged.
- **Agents whose own choices can be taken back.** Triage's judgments and the Planner's plans are beliefs too, so they fall when their evidence does.
- **Real pull requests** on two demo repositories: opened, rewritten, relabelled and closed with an explanation.
- **What if?** Simulate any belief being wrong on a throwaway copy of the graph, without writing anything.
- **A 3D console and an MCP server** to ask why and what if, with a guided tour on your first visit.

## How it works

Every belief is **held only while at least one of its Supports holds**, and a Support holds only while **all of its premises** are held. This is a truth maintenance system ([Doyle, 1979](https://doi.org/10.1016/0004-3702(79)90008-0)) on a graph database.

Here is what that looks like for one real decision, at the moment the jsonwebtoken RCE claim was withdrawn:

```mermaid
flowchart TB
  A1["<b>GHSA-27h2</b> · CVE-2022-23529<br/>RCE claim, HIGH<br/><i>withdrawn 2023-01-27</i>"]
  A2["<b>GHSA-8cf7</b><br/>HIGH"]
  A3["<b>GHSA-qwph</b><br/>MODERATE"]
  A4["<b>GHSA-hjrf</b><br/>MODERATE"]
  E["<b>Exposure</b><br/>gladys uses jsonwebtoken@8.5.1"]
  J["<b>Judgment by Triage</b><br/>the RCE claim is not reachable here"]
  D["<b>Decision</b><br/>upgrade to 9.0.0 at P2<br/>still held by 3 advisories"]
  P["<b>Plan by the Planner</b><br/>list it in the report"]

  A1 -.->|"support retracted"| E
  A2 --> E
  A3 --> E
  A4 --> E
  A1 -.->|retracted| J
  E --> D
  J -.->|"no longer lowers urgency"| D
  D --> P
  A1 -.->|retracted| P

  classDef gone fill:#ffe3ee,stroke:#bb1d5c,stroke-width:2px,stroke-dasharray:6 4,color:#12201b
  classDef held fill:#e6f7f2,stroke:#0a7058,color:#0b1311
  classDef kept fill:#3fd3b0,stroke:#0a7058,stroke-width:2px,color:#0b1311
  class A1,J,P gone
  class A2,A3,A4,E held
  class D kept
  linkStyle 0,4,6,8 stroke:#bb1d5c,stroke-width:2px
```

**Dashed and pink** nodes were retracted when GHSA-27h2 was withdrawn; **green** ones still hold. Each arrow is a Support, a recorded reason (the full model is under [Graph data model](#graph-data-model-and-the-queries-retcon-depends-on)). The decision keeps three of its four advisories, so its outcome is **Unchanged**, while Triage's judgment and the Planner's plan, which rested on the withdrawn claim, fall with it.

Every decision a retraction reaches gets one **outcome**:

| Outcome | Meaning | On GitHub |
|---|---|---|
| **Cancel** | No support left | Any open PR is closed with an explanation |
| **Downgrade** | Support left, lower urgency | The PR stays open, relabelled, with a comment |
| **Unchanged** | Other advisories still hold it up | Only the PR text is rewritten |

Nothing is ever deleted, so for any decision you can ask **"why?"** and see the full chain, including what was retracted, when, and why. This is what happens end to end when the worker sees a withdrawal:

```mermaid
sequenceDiagram
  autonumber
  participant OSV as OSV feed
  participant W as Worker
  participant E as Engine
  participant DB as FalkorDB
  participant AU as Auditor
  participant PF as Planner + Fixer
  participant GH as GitHub

  OSV->>W: advisory withdrawn
  W->>E: apply it
  E->>DB: mark it retracted
  loop until a round changes nothing
    E->>DB: retract broken Supports
    E->>DB: retract unsupported beliefs
  end
  E->>AU: why was it withdrawn?
  AU-->>E: classification and explanation
  E->>DB: recompute held decisions
  E-->>W: outcome per decision
  W->>PF: re-plan, write the text
  PF->>GH: close, relabel or rewrite the PR
```

Each round of the loop is one **wave**: a Support breaks when any of its premises is retracted, and a belief falls when it has no held Support left. The waves are stored, so the Graph view can replay them.

### The agents

All four agents run on Groq `gpt-oss-120b`.

| Agent | What it does |
|---|---|
| **Triage** | Finds where the project imports the affected package and calls the API the advisory names, then judges "exploitable here", "not reachable here" or "unknown", citing file and line. |
| **Planner** | At each decision point, chooses among the allowed actions (open a PR, list it in the report, keep, reopen, move to the report). Its choice is a **Plan** resting on the evidence it saw, so when that evidence is withdrawn the Plan is retracted and it plans again. A fixed **Policy** takes over if the choice is not allowed. |
| **Fixer** | Writes the prose of pull requests and comments from the decision, its plan and its why-chain. Titles, tables and links stay deterministic. |
| **Auditor** | Reads every withdrawal, classifies it (real retraction, duplicate, alias, scope change) and explains it. The graph decides outcomes; the Auditor only explains them. |

A Cancel always closes the pull request: no agent can keep work open once every advisory behind it is withdrawn.

## Real runs

Replaying the real 2019 to 2026 advisory history against two projects (568 events, about 30 seconds locally) produced these, all visible in the live console:

- **gladys, jsonwebtoken:** four advisories land on 2022-12-22. Triage reads Gladys's code and judges both HIGH claims *not reachable here*: `jwt.verify` gets the server's own `this.jwtSecret`, never attacker input. So the upgrade is P2, and the Planner lists it in the report instead of opening a pull request. When the RCE claim is withdrawn on 2023-01-27, Triage's judgment on it and the Planner's plan, which both rested on it, are retracted. The decision is Unchanged, held by the three advisories that remain.
- **wiredoor, axios:** a decision opens on 2025-07-23 for GHSA-rm8p-cx58-hcvx and is listed in the report. It is cancelled the next day when that advisory is withdrawn, and the separate form-data upgrade ([PR #27](https://github.com/Rudransh-1508/retcon-target-wiredoor/pull/27)) is untouched. On 2025-09-11 new axios advisories bring it back, and the Planner opens [PR #29](https://github.com/Rudransh-1508/retcon-target-wiredoor/pull/29). Six later withdrawals leave it unchanged, and Retcon says so in a comment.
- **wiredoor, express:** published on 2025-12-01 and listed in the report. The advisory is withdrawn the next day, nothing else holds the decision up, and it is cancelled.
- **Duplicates** (about 80% of withdrawals) count as the same evidence as their original, so withdrawing one changes nothing and touches nothing on GitHub.

> [!NOTE]
> The demo targets are snapshot copies (not forks, so nothing can reach upstream) of [GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys) at `7eb0b2a` and [wiredoor/wiredoor](https://github.com/wiredoor/wiredoor) at `e80904f`, both Apache-2.0. The GitHub token is limited to those two repositories, and the code refuses any other.

## Try it

Open the [live console](https://retcon-kappa.vercel.app/app). The first time, a short guided tour starts by itself; you can skip it and replay it from the **Tour** button.

1. Pick a decision. The **Why?** panel shows its chain of support, the Planner's reasoning and the decision's history.
2. Press **What if wrong?** on any advisory, exposure or judgment. Retcon copies the graph, applies the retraction to the copy, shows what would change, and deletes the copy.
3. Open **Graph** and **replay a retraction**. The recorded waves travel up through the plates.
4. Open **Agents** for one feed of everything each agent did, and **Timeline** for every withdrawal and correction with the Auditor's explanation.

<p align="center">
  <img src="docs/images/graph-3d.png" alt="The 3D graph: five plates for advisories, exposures, judgments, decisions and plans, with the links between them" width="100%">
</p>
<p align="center"><sub>The Graph view: one plate per kind of belief, each resting on the plates below it.</sub></p>

## Use Retcon from your own agent (MCP)

Retcon's memory is an MCP server, so any agent can ask it why, and what if.

| Tool | What it does |
|---|---|
| `decisions(project?, urgency?)` | Upgrades Retcon holds, most urgent first, with their pull requests |
| `why(id)` | The chain of support behind a decision, judgment, plan or advisory, including what was retracted |
| `what_if(id)` | What would change if a belief were wrong; runs on a copy of the graph and writes nothing |
| `timeline(limit?, only_retractions?)` | Recent withdrawals and corrections, with what each changed |
| `correct(id, reason)` | Retract a belief for real (local server only, needs the admin passphrase) |

```bash
# Remote, read only
claude mcp add --transport http retcon https://retcon-kappa.vercel.app/mcp

# Local, with `correct` (uses the FalkorDB settings and passphrase from .env)
claude mcp add retcon -- uv --directory /path/to/retcon run python -m retcon.mcp_server
```

Then ask: *"Using retcon, why is jsonwebtoken in gladys only in the report, and what would change if GHSA-8cf7-32gw-wr33 were wrong?"*

## Graph data model and the queries Retcon depends on

Beliefs never point at each other directly. A small **Support** node sits between a belief and the evidence it rests on, and records who wrote the reason:

```mermaid
flowchart TB
  W["<b>Event</b><br/>withdrawal or correction"] -->|TRIGGERED| R["<b>Retraction</b><br/>explained by the Auditor"]
  R ==>|"RETRACTED {wave}"| A["<b>Advisory</b><br/>an outside claim"]

  A -->|PREMISE| S1(("Support<br/>affects"))
  S1 -->|SUPPORTS| E["<b>Exposure</b><br/>project + package@version"]
  E -->|PREMISE| S2(("Support<br/>resolves"))
  S2 -->|SUPPORTS| D["<b>Decision</b><br/>upgrade, urgency P0 to P3"]
  A --> S3(("Support<br/>judged"))
  E --> S3
  S3 -->|SUPPORTS| J["<b>Judgment</b><br/>by Triage"]
  J -.->|ADJUSTS| D
  D --> S4(("Support<br/>planned"))
  A --> S4
  S4 -->|SUPPORTS| P["<b>Plan</b><br/>by the Planner"]
  P -->|CAUSED| X["<b>Action</b><br/>real PR, comment, label or close"]

  classDef ev fill:#ffe3ee,stroke:#bb1d5c,color:#12201b
  classDef sup fill:#12201b,stroke:#3fd3b0,stroke-width:2px,color:#f3f5f2
  classDef bel fill:#e6f7f2,stroke:#0a7058,color:#0b1311
  classDef act fill:#3fd3b0,stroke:#0a7058,color:#0b1311,stroke-width:2px
  classDef ret fill:#bb1d5c,stroke:#bb1d5c,color:#ffffff
  class A ev
  class S1,S2,S3,S4 sup
  class E,J,D,P bel
  class X act
  class W,R ret
```

**Nodes:** `Project`, `PackageVersion`, `Advisory`, `Exposure`, `Judgment`, `Decision`, `Plan`, `Action`, `Support`, `Event`, `Retraction`, `Agent`. The beliefs (`Advisory`, `Exposure`, `Judgment`, `Decision`, `Plan`) also carry the `Belief` label.

**Relationships:** `(Support)-[:PREMISE]->(node)` and `(Support)-[:SUPPORTS]->(belief)` carry the reasons. `(Agent)-[:WROTE]->(Support)` records who wrote a reason. `(Retraction)-[:RETRACTED {wave}]->(node)` records every retraction wave. Others: `DEPENDS_ON`, `DUPLICATE_OF`, `ALIAS_OF`, `ADJUSTS`, `TRIGGERED`, `ABOUT`, `CHANGED`, `CAUSED`.

**The rule:** a belief is held while at least one of its Supports is held, and a Support is held while all of its premises are held. A write that names no premises is rejected.

**Retraction (the core algorithm).** Mark the withdrawn advisory retracted, then repeat these two queries until neither changes anything. Each round is one wave:

```cypher
// 1. A Support dies when any of its premises is retracted
MATCH (s:Support {status: 'held'})-[:PREMISE]->(p:Node {status: 'retracted'})
WITH DISTINCT s SET s.status = 'retracted', s.retracted_at = $at RETURN s.id

// 2. A belief dies when no held Support is left
MATCH (b:Belief {status: 'held'})
OPTIONAL MATCH (b)<-[:SUPPORTS]-(s:Support {status: 'held'})
WITH b, count(s) AS held WHERE held = 0
SET b.status = 'retracted', b.retracted_at = $at RETURN b.id
```

**Recomputing every held decision** (urgency, evidence, target version) from the advisories that still hold, in one traversal and one batched write:

```cypher
MATCH (d:Decision {status: 'held'})<-[:SUPPORTS]-(:Support {status: 'held'})
      -[:PREMISE]->(e:Exposure {status: 'held'})<-[:SUPPORTS]-(s:Support {status: 'held'})
      -[:PREMISE]->(a:Advisory {status: 'held'})
RETURN d.id, collect(DISTINCT [a.evidence, a.rank, s.fix, a.id])
```

**What-if** runs the real retraction on a throwaway clone, so the live graph is never written: `GRAPH.COPY <graph> <scratch>`, retract on `<scratch>`, diff the decisions, then delete `<scratch>`.

**Why?** walks `PREMISE` and `SUPPORTS` from a decision back to its advisories, including retracted nodes, because nothing is ever deleted. Writes are idempotent (`MERGE`, with an index on `id` per label), so the graph can be rebuilt from the advisory feed. The code is in [`retcon/engine.py`](retcon/engine.py).

## Architecture

Everything runs on free tiers.

```mermaid
flowchart TB
  OSV[("<b>OSV advisory feed</b><br/>npm archive, then modified ids")]

  subgraph CORE["Retcon core (Python)"]
    direction TB
    WRK["<b>Worker</b><br/>GitHub Actions, every 10 minutes"]
    ENG["<b>Truth maintenance engine</b><br/>retract, recompute, why"]
    AGS["<b>Four agents</b> on Groq gpt-oss-120b<br/>Triage, Planner, Fixer, Auditor"]
    WRK --> ENG
    AGS <-->|"read memory, write beliefs"| ENG
  end

  DB[("<b>FalkorDB Cloud</b><br/>the shared memory")]
  TGT["<b>Target repositories</b><br/>snapshot copies of Gladys and wiredoor"]

  subgraph VER["Vercel"]
    direction TB
    API["<b>FastAPI</b><br/>/api and /mcp"]
    WEB["<b>Next.js</b><br/>landing page and 3D console"]
    API --> WEB
  end

  USER(["You, or any MCP agent"])

  OSV -->|"advisories and withdrawals"| WRK
  ENG <-->|"beliefs, supports, retractions"| DB
  ENG ==>|"opens, rewrites and closes real PRs"| TGT
  DB --> API
  WEB --> USER
  API -->|"MCP tools"| USER

  classDef data fill:#f3f5f2,stroke:#97a8a1,color:#12201b
  classDef core fill:#ffffff,stroke:#12201b,color:#12201b
  classDef agent fill:#e6f7f2,stroke:#0a7058,color:#0b1311
  classDef db fill:#3fd3b0,stroke:#0a7058,color:#0b1311,stroke-width:2px
  classDef out fill:#12201b,stroke:#3fd3b0,stroke-width:2px,color:#f3f5f2
  classDef pr fill:#ffe3ee,stroke:#bb1d5c,color:#12201b
  class OSV data
  class TGT pr
  class WRK,ENG core
  class AGS agent
  class DB db
  class API,WEB,USER out
  style CORE fill:#f3f5f2,stroke:#d9e0dc,color:#12201b
  style VER fill:#f3f5f2,stroke:#d9e0dc,color:#12201b
```

- **Graph:** FalkorDB Cloud. The graph can always be rebuilt from the feed, so a restart of the free instance is harmless.
- **Worker:** a GitHub Actions workflow that runs the agents. GitHub's 10-minute schedule is best effort, so the site also starts it: right after an admin correction, and whenever the console opens and the agents have not run for 10 minutes (`POST /api/tick`). The site does this with a token that can only start this workflow; the Groq and GitHub keys stay in the worker.
- **Advisory feed:** the public OSV bucket (the npm archive on rebuild, the modified-id index after that). OSV's query API omits withdrawn advisories, so it is not used.
- **LLMs:** Groq, with a key pool, rotation, backoff and a fallback model.
- **API and UI:** FastAPI serverless functions plus a Next.js static export in `web/` (landing page at `/`, console at `/app`, 3D graph in three.js), all on Vercel.

## Getting started

### Prerequisites

- [Python 3.12+](https://www.python.org/) and [uv](https://docs.astral.sh/uv/)
- [Docker](https://www.docker.com/), for a local FalkorDB
- [Node.js 22](https://nodejs.org/), for the web app

### Run it locally

1. Start FalkorDB. Tests and local development use port 6390:

   ```bash
   docker run -d -p 6390:6379 falkordb/falkordb:latest
   ```

2. Install the Python dependencies and run the scenario tests against that FalkorDB:

   ```bash
   uv sync
   uv run pytest
   ```

3. Replay the advisory history into a local graph without touching GitHub, then serve the API:

   ```bash
   FALKORDB_HOST= RETCON_GRAPH=dev uv run python -m retcon.cli run --dry-run
   FALKORDB_HOST= RETCON_GRAPH=dev uv run uvicorn retcon.api:app --port 8000
   ```

4. Start the web app. It proxies `/api` to `http://127.0.0.1:8000` (set `RETCON_API` to point elsewhere):

   ```bash
   cd web && npm ci && npm run dev
   ```

> [!TIP]
> `--dry-run` never touches GitHub, and an empty `FALKORDB_HOST` means the local Docker instance. You only need the keys below to run the agents and open real pull requests.

### Configuration

Settings are read from the environment or a local `.env` file.

| Variable | What it is for |
|---|---|
| `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USERNAME`, `FALKORDB_PASSWORD` | FalkorDB Cloud. Leave the host empty to use local Docker. |
| `RETCON_LOCAL_FALKORDB_PORT` | Port of the local FalkorDB (default `6390`) |
| `RETCON_GRAPH` | Name of the graph to use, for example `dev` |
| `GROQ_API_KEYS` or `GROQ_API_KEY_1..N` | Groq keys for the agents; several keys are rotated |
| `GITHUB_TOKEN` | Fine-grained token for the two target repositories |
| `RETCON_ADMIN_PASSPHRASE` | Required to retract a belief for real |
| `RETCON_PUBLIC_URL` | Public URL used in links written to GitHub |
| `RETCON_DISPATCH_TOKEN` | On Vercel only: a fine-grained token on this repository with Actions read and write, so the site can start the worker |

### Tests

- **Engine (Python):** the tests drive one seam, the engine, exactly as the worker and API do, against **real FalkorDB** with **real advisory and lockfile fixtures**. Only the LLM (a stub) and GitHub (an in-memory fake) are replaced. Scenarios include the real jsonwebtoken, axios, express and duplicate withdrawals, corrections, what-if, the write rule, rebuild with re-linking, and aliases.
- **Console (browser):** `cd web && npm run test:e2e` runs Playwright against the static export, answering every `/api` request from recorded responses. It covers the views, the guided tour and accessibility. See [`web/e2e/README.md`](web/e2e/README.md).

## Resources

- [Glossary](CONTEXT.md): the words Retcon uses, from Advisory to Retraction
- [Spec and tickets](https://github.com/Rudransh-1508/retcon/issues/1): how Retcon was planned and built
- [A Truth Maintenance System](https://doi.org/10.1016/0004-3702(79)90008-0) (Doyle, 1979): the idea Retcon is built on
- [FalkorDB documentation](https://docs.falkordb.com/) and the [OSV data](https://osv.dev/) Retcon reads

## Built with AI assistance

Retcon was built with Claude Code (Anthropic) as a coding assistant, for implementation, tests and the web UI, as the FalkorDB Graph Hacks rules allow when disclosed.
