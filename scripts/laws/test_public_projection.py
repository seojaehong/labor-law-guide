"""Offline regression: compare every generated document with the unfiltered builder."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/laws/build_site_data.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
marker = "INTERNAL_PROVENANCE_SENTINEL"
for rule in builder.RULES["rules"]:
    rule["source"] = marker
    rule["future_internal_field"] = marker
# Optional matcher field proposed by PR33 must survive this independent projection.
# This fixture changes no committed catalog or matcher behavior.
builder.RULES["rules"][0]["anchor"] = ["synthetic-public-anchor"]
projection = builder.public_rule

def generate(project):
    builder.public_rule = project
    with tempfile.TemporaryDirectory(dir=ROOT) as directory:
        builder.OUT = Path(directory)
        with contextlib.redirect_stdout(io.StringIO()):
            builder.main()
        return {file.name: json.loads(file.read_text()) for file in builder.OUT.glob("*.json")}

baseline = generate(lambda rule: dict(rule))
actual = generate(projection)
assert baseline.keys() == actual.keys()
for name, expected in baseline.items():
    groups = [expected["rules"]] if name == "rules.json" else []
    groups += [step["rules"] for step in expected.get("steps", [])]
    for rules in groups:
        for rule in rules:
            rule.pop("source", None)
            rule.pop("future_internal_field", None)
    assert expected == actual[name], f"Public behavior changed in {name}"
    assert marker not in json.dumps(actual[name])
assert len(actual["rules.json"]["rules"]) == 44
assert actual["rules.json"]["rules"][0]["anchor"] == ["synthetic-public-anchor"]
print("PASS: all public documents preserve legal/matcher fields and exclude internal provenance")
