"""The Razorpay client: auth, retries and error hygiene."""

import httpx
import pytest

from backend.services.razorpay_client import RazorpayClient, RazorpayError


def client_for(handler) -> RazorpayClient:
    return RazorpayClient(
        "key", "secret", transport=httpx.MockTransport(handler)
    )


def test_creates_a_monthly_plan_in_paise_with_basic_auth():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "plan_1"})

    plan = client_for(handler).create_plan("Solo", 49900)
    assert plan == {"id": "plan_1"}
    request = seen[0]
    assert request.url.path == "/v1/plans"
    assert request.headers["authorization"].startswith("Basic ")
    body = request.read().decode()
    assert '"amount":49900' in body.replace(" ", "")
    assert '"period":"monthly"' in body.replace(" ", "")


def test_retries_a_server_error_then_succeeds():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(502)
        return httpx.Response(200, json={"id": "order_1"})

    order = client_for(handler).create_order(100, "r1", {})
    assert order["id"] == "order_1"
    assert calls["n"] == 2


def test_gives_up_after_repeated_failures_with_a_generic_message():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom: internal detail")

    with pytest.raises(RazorpayError) as err:
        client_for(handler).create_order(100, "r1", {})
    assert "internal detail" not in str(err.value)


def test_a_rejected_request_never_leaks_the_provider_text():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400, json={"error": {"description": "secret provider detail"}}
        )

    with pytest.raises(RazorpayError) as err:
        client_for(handler).create_subscription("plan_1", {})
    assert "secret provider detail" not in str(err.value)


def test_cancel_happens_at_the_end_of_the_cycle():
    bodies: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.read().decode().replace(" ", ""))
        return httpx.Response(200, json={"id": "sub_1"})

    client_for(handler).cancel_subscription("sub_1")
    assert '"cancel_at_cycle_end":1' in bodies[0]


def test_a_client_error_is_not_retried():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={})

    with pytest.raises(RazorpayError):
        client_for(handler).create_order(100, "r1", {})
    assert calls["n"] == 1


def test_a_dropped_connection_is_retried_then_succeeds():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectTimeout("slow")
        return httpx.Response(200, json={"id": "sub_1"})

    assert client_for(handler).cancel_subscription("sub_1") == {"id": "sub_1"}
    assert calls["n"] == 3


def test_a_subscription_carries_the_offer_only_when_given():
    bodies: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.read().decode().replace(" ", ""))
        return httpx.Response(200, json={"id": "sub_1"})

    client = client_for(handler)
    client.create_subscription("plan_1", {"business_id": "b"}, "offer_1")
    client.create_subscription("plan_1", {"business_id": "b"})
    assert '"offer_id":"offer_1"' in bodies[0]
    assert "offer_id" not in bodies[1]
    assert '"total_count":120' in bodies[1]


def test_an_order_is_created_in_inr_with_the_given_receipt():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.read().decode().replace(" ", ""))
        return httpx.Response(200, json={"id": "order_1"})

    client_for(handler).create_order(999000, "rcpt-1", {"cycle": "yearly"})
    assert '"currency":"INR"' in seen[0]
    assert '"receipt":"rcpt-1"' in seen[0]
    assert '"amount":999000' in seen[0]


def test_a_malformed_success_body_is_an_error_not_a_crash():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>gateway</html>")

    with pytest.raises(Exception):  # noqa: B017
        client_for(handler).create_order(100, "r1", {})
