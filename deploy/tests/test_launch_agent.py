"""R31: the LaunchAgent template and its install script (installing it is manual, criterion
22)."""

import plistlib
import subprocess
from pathlib import Path

BACKUP = Path(__file__).parents[1] / "backup"


def test_the_template_is_the_backup_job_at_three() -> None:
    text = (BACKUP / "skin.combo.db-backup.plist.template").read_text()
    filled = (
        text.replace("__UV__", "/opt/uv")
        .replace("__REPO__", "/repo")
        .replace("__PATH__", "/opt:/usr/bin")
        .replace("__LOG__", "/logs/db-backup.log")
    )
    job = plistlib.loads(filled.encode())
    assert job["Label"] == "skin.combo.db-backup"
    assert job["ProgramArguments"] == [
        "/opt/uv",
        "run",
        "--frozen",
        "--project",
        "/repo/deploy",
        "python",
        "-m",
        "combo_publish",
        "backup",
    ]
    assert job["StartCalendarInterval"] == {"Hour": 3, "Minute": 0}
    assert job["StandardOutPath"] == job["StandardErrorPath"] == "/logs/db-backup.log"
    assert "__" not in filled


def test_the_install_script_is_valid_bash_and_fills_every_placeholder() -> None:
    script = BACKUP / "install.sh"
    subprocess.run(["bash", "-n", str(script)], check=True)
    text = script.read_text()
    for placeholder in ("__UV__", "__REPO__", "__PATH__", "__LOG__"):
        assert f"s|{placeholder}|" in text
    assert "launchctl bootout" in text and "launchctl bootstrap" in text
