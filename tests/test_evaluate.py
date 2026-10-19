"""With and without the reasons, on the real jsonwebtoken and express withdrawals."""

from retcon.evaluate import evaluate
from tests.conftest import add, published, withdrawn

JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]


def test_only_the_reasons_handle_both_withdrawals_correctly(engine):
    add(engine, "gladys")
    add(engine, "wiredoor")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    engine.process_event(published("GHSA-pj86-cfqh-vqx6"))
    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))  # three other advisories still hold the upgrade
    engine.process_event(withdrawn("GHSA-pj86-cfqh-vqx6"))  # nothing else holds the express upgrade

    report = evaluate(engine)
    should = {c.decision: c.should_cancel for c in report.cases}
    # jsonwebtoken keeps three advisories; express (used by both projects) keeps none.
    assert should == {"decision:gladys:jsonwebtoken": False, "decision:gladys:express": True,
                      "decision:wiredoor:express": True}
    summary = report.summary()
    assert summary["retcon"]["correct"] == 3 and summary["retcon"]["decisions"] == 3
    # Undoing everything linked to a withdrawn advisory cancels jsonwebtoken, which three advisories still hold.
    assert summary["undo_without_reasons"]["wrongly_cancelled"] == 1
    # Ignoring withdrawals keeps both express upgrades, which no advisory holds anymore.
    assert summary["ignore_withdrawals"]["stale_kept"] == 2

def test_an_open_pull_request_counts_against_the_strategy_that_closes_it(engine):
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    engine.record_action("decision:gladys:jsonwebtoken", "open_pr", "https://example/pull/1", at="2022-12-23T00:00:00Z")
    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))

    summary = evaluate(engine).summary()
    assert summary["undo_without_reasons"]["open_prs_wrongly_closed"] == 1
    assert summary["retcon"]["open_prs_wrongly_closed"] == 0
