#!/usr/bin/env python3
"""Preview or rebuild only message vectors. Stop all index consumers before --apply."""
import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backend", required=True, help="Trusted internal Backend URL")
parser.add_argument("--namespace-id", required=True)
parser.add_argument("--apply", action="store_true")
parser.add_argument("--retry-failed", type=Path)
parser.add_argument("--report", type=Path, required=True)
args = parser.parse_args()
payload = {"namespace_id": args.namespace_id, "apply": args.apply}
if args.retry_failed:
    previous = json.loads(args.retry_failed.read_text())
    if previous["namespace_id"] != args.namespace_id:
        parser.error("Retry report belongs to a different namespace")
    payload["message_ids"] = previous["failed"]
request = Request(args.backend.rstrip("/") + "/internal/api/v1/rebuild_message_index",
                  data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
with urlopen(request, timeout=3600) as response:
    report = json.load(response)
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print({key: len(value) if isinstance(value, list) else value for key, value in report.items()})
raise SystemExit(1 if report["failed"] else 0)
