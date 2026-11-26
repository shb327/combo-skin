"""Spec 026, criteria 16 to 19: the merge deploy jobs in `.github/workflows/deploy.yml`, read
as YAML, with the gate's and report's scripts run under bash."""

import re
import subprocess
from pathlib import Path
from typing import Any

import pytest
import yaml

WORKFLOWS = Path(__file__).parents[2] / ".github" / "workflows"
DEPLOY = WORKFLOWS / "deploy.yml"
WEBSITE = WORKFLOWS / "website.yml"
NEW_JOBS = ("website", "gate", "build-site", "deploy-site", "report")
CONDITION = (
    "github.repository == 'shb327/combo-skin' && "
    "((github.event_name == 'push' && github.ref == 'refs/heads/main') || "
    "github.event_name == 'workflow_dispatch')"
)
CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
SETUP_UV = "astral-sh/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2"
CLOUDFLARE = re.compile(r"secrets\.CLOUDFLARE_")

type Json = Any


def load(path: Path) -> Json:
    return yaml.safe_load(path.read_text())


def triggers(workflow: Json) -> Json:
    # YAML 1.1 reads the key `on` as true.
    return workflow.get("on", workflow.get(True))


@pytest.fixture
def deploy() -> Json:
    return load(DEPLOY)


def jobs(deploy: Json) -> dict[str, Json]:
    return dict(deploy["jobs"])


def steps_text(job: Json) -> str:
    return yaml.safe_dump(job.get("steps", []))


# Criterion 16


def test_the_check_job_is_unchanged(deploy: Json) -> None:
    assert jobs(deploy)["check"] == {
        "runs-on": "ubuntu-24.04",
        "steps": [
            {"uses": f"{CHECKOUT}", "with": {"persist-credentials": False}},
            {
                "uses": SETUP_UV,
                "with": {
                    "version": "0.13.6",
                    "enable-cache": True,
                    "cache-dependency-glob": "deploy/uv.lock",
                },
            },
            {"run": "uv sync --locked"},
            {"run": "uv run ruff format --check"},
            {"run": "uv run ruff check"},
            {"run": "uv run mypy"},
            {"run": "uv run pytest"},
        ],
    }


def test_the_new_jobs_run_only_for_main_or_by_hand_in_this_repository(deploy: Json) -> None:
    found = jobs(deploy)
    assert set(found) == {"check", *NEW_JOBS}
    assert " ".join(found["website"]["if"].split()) == CONDITION
    assert " ".join(found["gate"]["if"].split()) == CONDITION
    assert found["website"]["uses"] == "./.github/workflows/website.yml"
    assert set(found["build-site"]["needs"]) == {"check", "website", "gate"}
    assert found["build-site"]["if"] == "needs.gate.outputs.build == 'true'"
    assert set(found["deploy-site"]["needs"]) == {"gate", "build-site"}
    assert found["deploy-site"]["if"] == "needs.gate.outputs.deploy == 'true'"
    assert set(triggers(deploy)) == {"push", "pull_request", "workflow_dispatch"}


def test_only_the_release_step_holds_the_cloudflare_credential(deploy: Json) -> None:
    found = jobs(deploy)
    assert [name for name, job in found.items() if "environment" in job] == ["deploy-site"]
    assert found["deploy-site"]["environment"] == "production"
    for name, job in found.items():
        if name != "deploy-site":
            assert not CLOUDFLARE.search(yaml.safe_dump(job)), name
    holding = [
        step for step in found["deploy-site"]["steps"] if CLOUDFLARE.search(yaml.safe_dump(step))
    ]
    assert len(holding) == 1
    release = holding[0]
    assert "deploy-code release" in release["run"]
    # Nothing is installed or built while the token is in the environment.
    assert release["run"].startswith("uv run --no-sync python -m combo_publish deploy-code release")
    syncs = [
        i
        for i, step in enumerate(found["deploy-site"]["steps"])
        if "uv sync" in step.get("run", "")
    ]
    assert syncs and max(syncs) < found["deploy-site"]["steps"].index(release)
    assert release["env"]["CLOUDFLARE_API_TOKEN"] == "${{ secrets.CLOUDFLARE_API_TOKEN }}"
    assert release["env"]["CLOUDFLARE_ACCOUNT_ID"] == "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
    assert "env" not in found["deploy-site"]


def test_the_build_job_has_no_environment_and_no_credential(deploy: Json) -> None:
    build = jobs(deploy)["build-site"]
    assert "environment" not in build
    assert "env" not in build
    text = steps_text(build)
    assert "CLOUDFLARE" not in text
    builds = [step for step in build["steps"] if "deploy-code build" in step.get("run", "")]
    assert len(builds) == 1
    assert builds[0]["env"] == {"PAGES_PROJECT": "${{ secrets.PAGES_PROJECT }}"}


def test_the_deploy_job_never_installs_the_website(deploy: Json) -> None:
    text = steps_text(jobs(deploy)["deploy-site"])
    assert "website" not in text
    assert "deploy/package-lock.json" in text


# Criterion 17


@pytest.mark.parametrize("path", sorted(WORKFLOWS.glob("*.yml")), ids=lambda path: path.name)
def test_every_workflow_is_read_only_and_pinned(path: Path) -> None:
    text = path.read_text()
    workflow = load(path)
    assert "pull_request_target" not in text
    assert workflow["permissions"] == {"contents": "read"}
    for name, job in workflow["jobs"].items():
        assert "permissions" not in job, name
    uses = re.findall(r"^\s*(?:-\s+)?uses:\s*(\S+)", text, re.M)
    assert uses
    for used in uses:
        if used.startswith("./"):
            continue
        assert re.fullmatch(r"[\w.-]+/[\w.-]+(?:/[\w./-]+)?@[0-9a-f]{40}", used), used
    for job in workflow["jobs"].values():
        for step in job.get("steps", []):
            if str(step.get("uses", "")).startswith("actions/checkout@"):
                assert step["with"]["persist-credentials"] is False


# Criterion 18


def test_deploys_are_never_cancelled(deploy: Json) -> None:
    assert jobs(deploy)["deploy-site"]["concurrency"] == {
        "group": "merge-deploy-production",
        "cancel-in-progress": False,
    }
    assert deploy["concurrency"] == {
        "group": "deploy-${{ github.ref }}",
        "cancel-in-progress": "${{ github.ref != 'refs/heads/main' }}",
    }


def test_every_new_job_that_runs_on_a_machine_has_a_time_limit(deploy: Json) -> None:
    limits = {
        name: job.get("timeout-minutes")
        for name, job in jobs(deploy).items()
        if name in NEW_JOBS and "runs-on" in job
    }
    assert limits == {"gate": 5, "build-site": 20, "deploy-site": 20, "report": 5}


def test_the_website_workflow_can_be_called_without_cancelling_its_own_run() -> None:
    website = load(WEBSITE)
    assert "workflow_call" in triggers(website)
    assert {"push", "pull_request"} <= set(triggers(website))
    assert "${{ github.workflow }}" in website["concurrency"]["group"]


# Criterion 19, and the report job


def run_script(script: str, env: dict[str, str], tmp_path: Path) -> tuple[str, str]:
    output, summary = tmp_path / "output", tmp_path / "summary"
    output.write_text("")
    summary.write_text("")
    subprocess.run(
        ["bash", "-e", "-c", script],
        env={**env, "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)},
        check=True,
        cwd=tmp_path,
    )
    return output.read_text(), summary.read_text()


def gate_script(deploy: Json) -> str:
    return str(jobs(deploy)["gate"]["steps"][0]["run"])


def test_the_gate_reads_the_switch(deploy: Json) -> None:
    step = jobs(deploy)["gate"]["steps"][0]
    assert step["env"]["SWITCH"] == "${{ vars.MERGE_DEPLOY }}"


@pytest.mark.parametrize(
    ("switch", "ref", "build", "deploys", "said"),
    [
        ("on", "refs/heads/main", "true", "true", ""),
        ("", "refs/heads/main", "false", "false", "merge deploys are off"),
        ("On", "refs/heads/main", "false", "false", "merge deploys are off"),
        ("off", "refs/heads/main", "false", "false", "merge deploys are off"),
        ("on", "refs/heads/a-branch", "true", "false", "only main deploys"),
        ("", "refs/heads/a-branch", "true", "false", "only main deploys"),
    ],
)
def test_the_gate_deploys_only_when_the_switch_is_on(
    deploy: Json, tmp_path: Path, switch: str, ref: str, build: str, deploys: str, said: str
) -> None:
    output, summary = run_script(gate_script(deploy), {"SWITCH": switch, "REF": ref}, tmp_path)
    assert output.splitlines() == [f"build={build}", f"deploy={deploys}"]
    if said:
        assert summary.startswith("Not deployed: ")
        assert said in summary
    else:
        assert summary == ""
    if "off" in said:
        assert summary.strip() == (
            "Not deployed: merge deploys are off (repository variable MERGE_DEPLOY)."
        )


@pytest.mark.parametrize(
    ("results", "line"),
    [
        ({"WEBSITE": "failure"}, "Not deployed: the website checks failed."),
        ({"CHECK": "failure"}, "Not deployed: the deploy package's checks failed."),
        ({"BUILD": "failure"}, "Not deployed: build-site stopped; its summary says why."),
        ({"DEPLOY": "failure"}, "Not deployed: deploy-site stopped; its summary says why."),
        ({"BUILD": "cancelled"}, "Not deployed: the run was cancelled."),
        ({}, ""),
        ({"BUILD": "skipped", "DEPLOY": "skipped"}, ""),
    ],
)
def test_the_report_says_why_when_a_job_stopped(
    deploy: Json, tmp_path: Path, results: dict[str, str], line: str
) -> None:
    env = {"CHECK": "success", "WEBSITE": "success", "GATE": "success"}
    env |= {"BUILD": "success", "DEPLOY": "success"} | results
    report = jobs(deploy)["report"]
    assert report["if"] == "always() && needs.gate.result != 'skipped'"
    _, summary = run_script(str(report["steps"][0]["run"]), env, tmp_path)
    assert summary.strip() == line


def test_the_header_comment_says_what_ci_can_do_now() -> None:
    text = DEPLOY.read_text()
    assert "nothing in CI can publish" not in text
    header = text.split("permissions:")[0]
    assert "The check job is read-only, with no secrets." in header
    assert "Only deploy-site holds a Cloudflare credential" in header
