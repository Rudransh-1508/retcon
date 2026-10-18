"""Words Retcon puts on GitHub. Templates are the source of truth; the Fixer agent may rewrite the prose.

Every pull request body ends with the decision marker so a rebuilt graph can find it again.
"""

from __future__ import annotations

from typing import Protocol

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "MEDIUM": 2, "LOW": 3}


class Writer(Protocol):
    def pr(self, ctx: dict) -> tuple[str, str]: ...
    def comment(self, change: str, ctx: dict, last: tuple | None) -> str: ...
    def report(self, project: str, decisions: list[dict], marker: str, ui: str) -> tuple[str, str]: ...


def held_advisories(ctx: dict) -> list[dict]:
    seen, out = set(), []
    for a in sorted(ctx["advisories"], key=lambda a: (SEVERITY_ORDER.get(a["severity"], 9), a["id"])):
        if a["status"] == "held" and a["evidence"] not in seen:
            seen.add(a["evidence"])
            out.append(a)
    return out


def retracted_advisories(ctx: dict) -> list[dict]:
    seen, out = set(), []
    for a in ctx["advisories"]:
        if a["status"] == "retracted" and a["id"] not in seen:
            seen.add(a["id"])
            out.append(a)
    return out


def _row(a: dict) -> str:
    fix = "no fixed release" if a["fix"] == "none" else f"`{a['fix']}`"
    return f"| [{a['id']}]({a['url']}) | {a['severity'].title()} | `{a['version']}` | {fix} | {a['summary']} |"


def advisory_table(ctx: dict) -> str:
    rows = [_row(a) for a in held_advisories(ctx)]
    table = "| Advisory | Severity | Affects | Fixed in | Summary |\n|---|---|---|---|---|\n" + "\n".join(rows)
    gone = retracted_advisories(ctx)
    if gone:
        table += "\n\n**No longer counted** (withdrawn by their publisher):\n" + "\n".join(
            f"- ~~[{a['id']}]({a['url']})~~ {a['summary']} (withdrawn {str(a['withdrawn'] or '')[:10]})" for a in gone)
    return table


class TemplateWriter:
    def pr(self, ctx: dict) -> tuple[str, str]:
        d = ctx["decision"]
        held = d["status"] == "held"
        n = len(held_advisories(ctx))
        target = d.get("target")
        if held:
            title = f"[{d['urgency']}] Upgrade {d['package']}" + (f" to {target}" if target and target != "none" else "")
            lead = (f"Retcon recommends upgrading **{d['package']}**"
                    + (f" to **{target}**" if target and target != "none" else "")
                    + f". It is justified by **{n} advisor{'y' if n == 1 else 'ies'}** that still hold{'s' if n == 1 else ''}"
                    + f", and its urgency is **{d['urgency']}** (from the most severe of them).")
        else:
            title = f"[cancelled] Upgrade {d['package']}"
            lead = (f"Retcon no longer recommends this upgrade: every advisory behind it was withdrawn. "
                    "Nothing in this pull request is needed any more.")
        notes = "".join(f"\n> {note}" for note in ctx.get("upgrade_notes", []))
        plan = ctx.get("plan")
        if plan and plan.get("rationale"):
            notes += f"\n\n**{plan['by']}:** {plan['rationale']}"
        body = (f"{lead}\n{notes}\n\n{advisory_table(ctx)}\n\n"
                f"**Why?** The full chain of support, including anything retracted, is at {ctx['ui']}\n\n"
                "<sub>Opened by Retcon. This pull request is rewritten whenever the advisories behind it change, "
                "and closed automatically if none are left.</sub>\n\n"
                f"{ctx['marker']}")
        return title, body

    def comment(self, change: str, ctx: dict, last: tuple | None) -> str:
        text = self._comment(change, ctx, last)
        plan = ctx.get("plan")
        if plan and plan.get("rationale") and change != "cancel":
            head, sep, tail = text.partition("\n\nTrail:")
            text = f"{head}\n\n**{plan['by']}:** {plan['rationale']}{sep}{tail}"
        return text

    def _comment(self, change: str, ctx: dict, last: tuple | None) -> str:
        d = ctx["decision"]
        reasons = [h for h in ctx.get("new_history", []) if h["kind"] == "withdrawn"]
        because = "".join(f"\n- [{h['advisory']}](https://github.com/advisories/{h['advisory']}) was withdrawn "
                          f"on {str(h['at'])[:10]}"
                          + (f". Auditor ({h['classification'].replace('_', ' ')}): {h['rationale']}"
                             if h.get("rationale") else "") for h in reasons)
        because += "".join(f"\n- {str(h.get('by') or 'a person').split(':')[-1]} corrected `{h['target']}`: "
                           f"{h.get('reason') or 'marked as wrong'}"
                           for h in ctx.get("new_history", []) if h["kind"] == "correction")
        n = len(held_advisories(ctx))
        if change == "cancel":
            return (f"**Retcon: cancelled.** No advisory behind this upgrade still holds, so it is no longer needed."
                    f"{because}\n\nClosing. Trail: {ctx['ui']}")
        if change == "downgrade":
            return (f"**Retcon: downgraded from {last[1]} to {d['urgency']}.** The upgrade is still justified by "
                    f"{n} advisor{'y' if n == 1 else 'ies'}, so this stays open at lower priority.{because}\n\n"
                    f"Trail: {ctx['ui']}")
        if change == "escalate":
            new = [h for h in ctx.get("new_history", []) if h["kind"] == "published"]
            added = "".join(f"\n- [{h['advisory']}](https://github.com/advisories/{h['advisory']}) was published"
                            for h in new)
            return f"**Retcon: escalated from {last[1]} to {d['urgency']}.**{added}\n\nTrail: {ctx['ui']}"
        if change == "reopen":
            return (f"**Retcon: reopened.** New evidence supports this upgrade again "
                    f"({n} advisor{'y' if n == 1 else 'ies'}, {d['urgency']}). Trail: {ctx['ui']}")
        return (f"**Retcon: support changed, priority unchanged ({d['urgency']}).** "
                f"{n} advisor{'y still justifies' if n == 1 else 'ies still justify'} this upgrade.{because}\n\nTrail: {ctx['ui']}")

    def report(self, project: str, decisions: list[dict], marker: str, ui: str) -> tuple[str, str]:
        held = [d for d in decisions if d["status"] == "held"]
        gone = [d for d in decisions if d["status"] != "held"]
        lines = [f"- [ ] **{d['urgency']}** `{d['package']}`"
                 + (f" to `{d['target']}`" if d.get("target") and d["target"] != "none" else " (no fixed release yet)")
                 + f", {len(d.get('evidence') or [])} advisories ([why?]({ui}/?why={d['id']}))" for d in held]
        cancelled = [f"- ~~`{d['package']}`~~ cancelled: every advisory behind it was withdrawn "
                     f"([why?]({ui}/?why={d['id']}))" for d in gone]
        body = (f"Lower-priority upgrades Retcon is tracking for **{project}**. "
                f"P0 and P1 upgrades get their own pull request; these get one if they escalate.\n\n"
                + ("\n".join(lines) or "_Nothing open._")
                + ("\n\n**Cancelled**\n" + "\n".join(cancelled) if cancelled else "")
                + f"\n\n<sub>Maintained by Retcon and rewritten on every change.</sub>\n\n{marker}")
        return f"Retcon report: {len(held)} lower-priority upgrade{'s' if len(held) != 1 else ''}", body
