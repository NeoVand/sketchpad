"""Spawn jobs on the deployed app `sketchpad-baselines`, record each call id in calls.json, exit (deploy + spawn: no
live client, so a job survives the laptop sleeping).

  uvx --with modal python spawn.py download <repo> <revision>
  uvx --with modal python spawn.py probe <model_key>
  uvx --with modal python spawn.py stock <job> <model_key> <mode[,mode]> <deadline_s>
  uvx --with modal python spawn.py sketchpad <job>
  uvx --with modal python spawn.py status
"""
import json
import pathlib
import sys
import time

import modal

APP = "sketchpad-baselines"
CALLS = pathlib.Path(__file__).with_name("calls.json")


def record(job, call, args):
    calls = json.loads(CALLS.read_text()) if CALLS.exists() else {}
    calls[job] = {"call_id": call.object_id, "args": args, "spawned": time.strftime("%Y-%m-%d %H:%M:%S %Z")}
    CALLS.write_text(json.dumps(calls, indent=1) + "\n")
    print(job, call.object_id, flush=True)


def main(a):
    if a[0] == "download":
        job = f"download_{a[1].split('/')[-1]}"
        record(job, modal.Function.from_name(APP, "download").spawn(a[1], a[2]), a)
    elif a[0] == "probe":
        job = f"probe_{a[1]}" + time.strftime("_%H%M")
        record(job, modal.Function.from_name(APP, "probe").spawn(job, a[1]), a)
    elif a[0] == "stock":
        job, key, modes, deadline = a[1], a[2], a[3].split(","), float(a[4])
        record(job, modal.Function.from_name(APP, "stock").spawn(job, key, modes, deadline), a)
    elif a[0] == "sketchpad":
        record(a[1], modal.Function.from_name(APP, "sketchpad").spawn(a[1]), a)
    elif a[0] == "status":
        for job, c in json.loads(CALLS.read_text()).items():
            try:
                res = modal.FunctionCall.from_id(c["call_id"]).get(timeout=0)
                print(job, "DONE", json.dumps(res)[:600])
            except TimeoutError:
                print(job, "running since", c["spawned"])
            except Exception as e:  # noqa: BLE001
                print(job, "ERROR", repr(e)[:400])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
