"""timing_middleware: Server-Timing header and structured latency log."""

import re
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app

SERVER_TIMING = re.compile(r"^app;dur=\d+\.\d$")


def test_response_carries_server_timing_header():
    r = TestClient(app).get("/")
    assert r.status_code == 200
    assert SERVER_TIMING.match(r.headers["Server-Timing"])


def test_header_is_present_on_error_responses():
    r = TestClient(app).get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert SERVER_TIMING.match(r.headers["Server-Timing"])


def test_header_is_present_on_unauthenticated_requests(api):
    r = api.get("/api/v1/ai/models")
    assert r.status_code == 401
    assert "Server-Timing" in r.headers


def test_request_is_logged_with_method_path_status_and_duration():
    with patch("backend.main.logger") as log:
        TestClient(app).get("/")
    log.info.assert_called_once()
    assert log.info.call_args.args[0] == "request_timing"
    fields = log.info.call_args.kwargs
    assert fields["method"] == "GET"
    assert fields["path"] == "/"
    assert fields["status"] == 200
    assert fields["duration_ms"] >= 0


def test_logged_duration_covers_header_duration():
    # Header is stamped at response start, the log after the body is sent,
    # so the log is never shorter (0.1 allows for rounding to one decimal).
    with patch("backend.main.logger") as log:
        r = TestClient(app).get("/")
    header_ms = float(r.headers["Server-Timing"].split("dur=")[1])
    assert log.info.call_args.kwargs["duration_ms"] >= header_ms - 0.1
