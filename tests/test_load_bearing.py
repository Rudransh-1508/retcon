"""Load-bearing advisories: FalkorDB's PageRank over what rests on what, on a throwaway copy."""

from tests.conftest import add, published, withdrawn

JWT_2022 = ["GHSA-27h2-hvpr-p74q", "GHSA-8cf7-32gw-wr33", "GHSA-hjrf-2m68-5959", "GHSA-qwph-4952-7xr6"]
EXPRESS = "GHSA-pj86-cfqh-vqx6"


def test_the_advisory_two_projects_rest_on_outranks_one_of_four_shared_claims(engine):
    add(engine, "gladys")
    add(engine, "wiredoor")
    for ghsa in [*JWT_2022, EXPRESS]:
        engine.process_event(published(ghsa))
    ranked = engine.load_bearing()
    ids = [r["id"] for r in ranked]
    # express is the only support of two upgrades; each jsonwebtoken advisory shares one upgrade with three others.
    assert ids[0] == EXPRESS
    assert set(ranked[0]["decisions"]) == {"decision:gladys:express", "decision:wiredoor:express"}
    assert set(JWT_2022) <= set(ids)


def test_withdrawn_advisories_drop_out_and_the_live_graph_is_never_changed(engine):
    add(engine, "gladys")
    for ghsa in JWT_2022:
        engine.process_event(published(ghsa))
    engine.process_event(withdrawn("GHSA-27h2-hvpr-p74q"))
    ids = [r["id"] for r in engine.load_bearing(project="gladys")]
    assert "GHSA-27h2-hvpr-p74q" not in ids and len(ids) == 3
    assert engine.q("MATCH ()-[r:RESTS_ON]->() RETURN count(r)")[0][0] == 0
    assert engine.load_bearing(project="wiredoor") == []
