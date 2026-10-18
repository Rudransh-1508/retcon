from tests.conftest import add, published, withdrawn


def test_express_withdrawal_cancels_a_decision_held_up_only_by_it(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pj86-cfqh-vqx6"))
    assert engine.node("decision:wiredoor:express")["status"] == "held"

    result = engine.process_event(withdrawn("GHSA-pj86-cfqh-vqx6"))

    assert result.outcome_of("decision:wiredoor:express") == "cancel"
    assert engine.node("decision:wiredoor:express")["status"] == "retracted"
    assert engine.node("exposure:wiredoor:express@4.21.2")["status"] == "retracted"


def test_axios_withdrawal_cancels_the_axios_upgrade_but_leaves_form_data_alone(engine):
    # The advisory was withdrawn because the flaw is in form-data: patching form-data is enough.
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-fjxv-7rqg-78g4"))
    engine.process_event(published("GHSA-rm8p-cx58-hcvx"))

    result = engine.process_event(withdrawn("GHSA-rm8p-cx58-hcvx"))

    assert result.outcome_of("decision:wiredoor:axios") == "cancel"
    assert result.outcome_of("decision:wiredoor:form-data") is None
    form_data = engine.node("decision:wiredoor:form-data")
    assert form_data["status"] == "held"
    assert form_data["urgency"] == "P0"


def test_duplicate_withdrawal_with_original_standing_is_unchanged(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pmv8-rq9r-6j72"))   # original
    engine.process_event(published("GHSA-4ww2-rjh2-xpv9"))   # duplicate of it

    result = engine.process_event(withdrawn("GHSA-4ww2-rjh2-xpv9"))

    assert result.outcome_of("decision:wiredoor:axios") == "unchanged"
    axios = engine.node("decision:wiredoor:axios")
    assert axios["status"] == "held"
    assert axios["evidence"] == ["GHSA-pmv8-rq9r-6j72"]
    assert engine.node("exposure:wiredoor:axios@1.10.0")["status"] == "held"


def test_retracted_nodes_are_kept_with_timestamps_and_shown_in_why(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pj86-cfqh-vqx6"))
    w = withdrawn("GHSA-pj86-cfqh-vqx6")
    engine.process_event(w)

    advisory = engine.node("GHSA-pj86-cfqh-vqx6")
    assert advisory["status"] == "retracted"
    assert advisory["retracted_at"] == w["at"]

    why = engine.why("decision:wiredoor:express")
    assert why["status"] == "retracted"
    [resolves] = why["supports"]
    assert resolves["status"] == "retracted"
    exposure = resolves["premises"][0]
    assert exposure["status"] == "retracted"
    advisory_in_why = exposure["supports"][0]["premises"][0]
    assert advisory_in_why["status"] == "retracted"
    assert advisory_in_why["retracted_by"][0]["trigger"] == "event:withdrawn:GHSA-pj86-cfqh-vqx6"


def test_retraction_reports_propagation_waves_in_order(engine):
    add(engine, "wiredoor")
    engine.process_event(published("GHSA-pj86-cfqh-vqx6"))
    result = engine.process_event(withdrawn("GHSA-pj86-cfqh-vqx6"))

    flat = [node for wave in result.waves for node in wave]
    order = {node: i for i, wave in enumerate(result.waves) for node in wave}
    assert flat[0] == "GHSA-pj86-cfqh-vqx6"
    assert order["exposure:wiredoor:express@4.21.2"] < order["decision:wiredoor:express"]


def test_withdrawal_of_an_unknown_advisory_changes_nothing(engine):
    add(engine, "wiredoor")
    result = engine.process_event(withdrawn("GHSA-pj86-cfqh-vqx6"))
    assert result.changes == []
    assert engine.node("decision:wiredoor:express")["status"] == "retracted"
