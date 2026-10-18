# Retcon

Retcon watches security advisories for a set of real projects, acts on them through real GitHub issues and pull requests, and when an advisory is withdrawn or a belief is corrected, revises exactly the work that rested on it and nothing more.

## Evidence

**Advisory**:
A published claim from an outside source (GitHub Advisory Database via OSV) that a range of versions of a package is vulnerable.
_Avoid_: CVE (a CVE id is one alias of an advisory), vuln, alert

**Alias**:
Another identifier (CVE, GHSA) under which the same advisory is published; aliased advisories are one piece of evidence, not several.

**Duplicate**:
An advisory withdrawn because another advisory already describes the same flaw; its withdrawal removes one support but the original advisory still stands.

**Withdrawal**:
The outside event in which an advisory source takes back its claim (GitHub "withdrawn", NVD "rejected").
_Avoid_: retraction, deletion

**Correction**:
A human statement that a specific belief is wrong.

## Beliefs

**Project**:
A target repository Retcon watches, frozen at a snapshot commit, whose lockfile defines what it depends on.
_Avoid_: repo, service, app, target

**Exposure**:
The belief that a project depends on a specific vulnerable package version; identified by (project, package version), never by advisory.
_Avoid_: finding, hit, match

**Judgment**:
A belief produced by an agent's reasoning (for example, "exploitable here because jwt.verify receives a user-controlled key"), always recorded with what it was based on.

**Support**:
One reason a belief or decision stands; it holds only while all of its premises hold. A belief stands while at least one of its supports holds.
_Avoid_: justification, reason, source

**Retraction**:
Retcon's operation that marks a belief, decision, or advisory as no longer held and re-evaluates everything that depended on it. Triggered by a withdrawal or a correction.
_Avoid_: undo, delete, rollback

**What-if**:
A simulated retraction that shows what would change without writing anything.

## Work

**Decision**:
An intent to act on one package in one project (for example, "upgrade axios to at least 1.20.0"), supported by every exposure the action would resolve.
_Avoid_: task, ticket, recommendation

**Urgency**:
The priority (P0 to P3) of a decision, derived from the most severe of its supports that still hold.

**Action**:
A real change on GitHub caused by a decision: an issue, a pull request, a comment, a label, or a close.

**Outcome**:
What a retraction does to a decision: Cancel (no support left), Downgrade (supports left, lower urgency), or Unchanged.

## Agents

**Triage**:
The agent that reads an advisory and a project's code and records judgments about whether an exposure is exploitable.

**Fixer**:
The agent that turns decisions into actions and writes their text.

**Auditor**:
The agent that interprets each withdrawal (real retraction, duplicate, or alias) and records why a retraction happened.
